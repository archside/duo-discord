"""Inspect an IPA's iPhone Duo window inputs, or rewrite the main executable's SDK stamp.

    python -I tools/ipa/duo_ipa.py inspect Unbound.ipa
    python -I tools/ipa/duo_ipa.py stamp Unbound.ipa --sdk 27.1 [-o Unbound-sdk27.1.ipa]

iOS picks the iPhone Duo window tier from the SDK recorded in the main executable's
LC_BUILD_VERSION (26.x: phone-sized box, 27.0: most of the display, 27.1: full display).
`stamp` changes only that field, in every slice of the main executable. Info.plist,
frameworks, extensions and the injected tweak are copied byte for byte. The input is
never modified; installing the original IPA again is the rollback.
"""

from __future__ import annotations

import argparse
import json
import plistlib
import struct
import sys
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

FAT_MAGIC = 0xCAFEBABE
FAT_MAGIC_64 = 0xCAFEBABF
MH_MAGIC_64 = 0xFEEDFACF
LC_BUILD_VERSION = 0x32
LC_VERSION_MIN_IPHONEOS = 0x25
LC_ENCRYPTION_INFO_64 = 0x2C
LC_LOAD_DYLIB = 0x0C
LC_LOAD_WEAK_DYLIB = 0x80000018
PLATFORMS = {2: "ios", 7: "ios-simulator", 6: "maccatalyst"}

PLIST_KEYS = [
    "CFBundleIdentifier",
    "CFBundleShortVersionString",
    "CFBundleVersion",
    "CFBundleExecutable",
    "DTSDKName",
    "DTPlatformVersion",
    "DTXcode",
    "DTXcodeBuild",
    "MinimumOSVersion",
    "UIDeviceFamily",
    "UIRequiresFullScreen",
    "UISupportedInterfaceOrientations",
    "UIApplicationSceneManifest",
    "UILaunchStoryboardName",
]


def decode_version(packed: int) -> str:
    major, minor, patch = packed >> 16, (packed >> 8) & 0xFF, packed & 0xFF
    return f"{major}.{minor}.{patch}" if patch else f"{major}.{minor}"


def encode_version(text: str) -> int:
    parts = [int(p) for p in text.split(".")] + [0, 0]
    major, minor, patch = parts[:3]
    if not (0 <= major <= 0xFFFF and 0 <= minor <= 0xFF and 0 <= patch <= 0xFF):
        raise ValueError(f"not a Mach-O version: {text}")
    return (major << 16) | (minor << 8) | patch


@dataclass
class Slice:
    offset: int
    cputype: int
    platform: str | None = None
    minos: str | None = None
    sdk: str | None = None
    sdk_field: int | None = None  # absolute file offset of the 32-bit sdk value
    encrypted: bool = False
    dylibs: list[str] = field(default_factory=list)


def parse_slice(data: bytes, offset: int) -> Slice:
    magic, cputype, _, _, ncmds, _, _, _ = struct.unpack_from("<IiiIIIII", data, offset)
    if magic != MH_MAGIC_64:
        raise ValueError(f"unsupported Mach-O slice at {offset:#x} (magic {magic:#x})")
    found = Slice(offset=offset, cputype=cputype)
    cursor = offset + 32
    for _ in range(ncmds):
        cmd, size = struct.unpack_from("<II", data, cursor)
        if cmd == LC_BUILD_VERSION:
            platform, minos, sdk = struct.unpack_from("<III", data, cursor + 8)
            found.platform = PLATFORMS.get(platform, str(platform))
            found.minos, found.sdk, found.sdk_field = decode_version(minos), decode_version(sdk), cursor + 16
        elif cmd == LC_VERSION_MIN_IPHONEOS and found.sdk_field is None:
            minos, sdk = struct.unpack_from("<II", data, cursor + 8)
            found.platform = "ios"
            found.minos, found.sdk, found.sdk_field = decode_version(minos), decode_version(sdk), cursor + 12
        elif cmd == LC_ENCRYPTION_INFO_64:
            found.encrypted = struct.unpack_from("<I", data, cursor + 16)[0] != 0
        elif cmd in (LC_LOAD_DYLIB, LC_LOAD_WEAK_DYLIB):
            name_offset = struct.unpack_from("<I", data, cursor + 8)[0]
            raw = data[cursor + name_offset : cursor + size]
            found.dylibs.append(raw.split(b"\0", 1)[0].decode("utf-8", "replace"))
        cursor += size
    return found


def parse_macho(data: bytes) -> list[Slice]:
    magic = struct.unpack_from(">I", data, 0)[0]
    if magic in (FAT_MAGIC, FAT_MAGIC_64):
        count = struct.unpack_from(">I", data, 4)[0]
        entry, layout = (20, ">iiIII") if magic == FAT_MAGIC else (32, ">iiQQII")
        offsets = [struct.unpack_from(layout, data, 8 + i * entry)[2] for i in range(count)]
        return [parse_slice(data, o) for o in offsets]
    return [parse_slice(data, 0)]


def restamp(data: bytes, sdk: str) -> tuple[bytes, list[str]]:
    target = encode_version(sdk)
    patched = bytearray(data)
    before = []
    for s in parse_macho(data):
        if s.sdk_field is None:
            raise ValueError(f"slice at {s.offset:#x} has no LC_BUILD_VERSION or LC_VERSION_MIN_IPHONEOS")
        before.append(s.sdk or "?")
        struct.pack_into("<I", patched, s.sdk_field, target)
    return bytes(patched), before


def locate_app(archive: zipfile.ZipFile) -> tuple[str, dict]:
    plists = [n for n in archive.namelist() if n.startswith("Payload/") and n.count("/") == 2 and n.endswith(".app/Info.plist")]
    if len(plists) != 1:
        raise ValueError(f"expected one Payload/*.app/Info.plist, found {plists}")
    return plists[0].rsplit("/", 1)[0], plistlib.loads(archive.read(plists[0]))


def jsonable(value):
    if isinstance(value, (bytes, bytearray)):
        return f"<{len(value)} bytes>"
    if isinstance(value, dict):
        return {k: jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [jsonable(v) for v in value]
    return value


def tier(sdk: str | None) -> str:
    if sdk is None:
        return "unknown"
    version = encode_version(sdk)
    if version >= encode_version("27.1"):
        return "full display (27.1+ SDK)"
    if version >= encode_version("27.0"):
        return "most of the display, short of the status bar edge (27.0 SDK)"
    return "phone-sized window when open (26.x SDK or earlier)"


def inspect(path: Path) -> dict:
    with zipfile.ZipFile(path) as archive:
        app, info = locate_app(archive)
        executable = f"{app}/{info['CFBundleExecutable']}"
        slices = parse_macho(archive.read(executable))
    sdks = {s.sdk for s in slices}
    return {
        "ipa": str(path),
        "app": app,
        "executable": executable,
        "info": {k: jsonable(info[k]) for k in PLIST_KEYS if k in info},
        "slices": [
            {"cputype": s.cputype, "platform": s.platform, "minos": s.minos, "sdk": s.sdk, "encrypted": s.encrypted}
            for s in slices
        ],
        "nonSystemDylibs": sorted({d for s in slices for d in s.dylibs if not d.startswith(("/System/", "/usr/lib/"))}),
        "duoWindowTier": tier(min(sdks, key=encode_version) if None not in sdks else None),
    }


def stamp(path: Path, sdk: str, output: Path) -> dict:
    if output.resolve() == path.resolve():
        raise ValueError("refusing to overwrite the input IPA; it is the rollback")
    with zipfile.ZipFile(path) as source:
        app, info = locate_app(source)
        executable = f"{app}/{info['CFBundleExecutable']}"
        patched, before = restamp(source.read(executable), sdk)
        if any(s.encrypted for s in parse_macho(patched)):
            raise ValueError("main executable is FairPlay-encrypted; use a decrypted IPA")
        with zipfile.ZipFile(output, "w") as target:
            for entry in source.infolist():
                target.writestr(entry, patched if entry.filename == executable else source.read(entry))
    return {"input": str(path), "output": str(output), "executable": executable, "sdkBefore": before, "sdkAfter": sdk}


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("inspect").add_argument("ipa", type=Path)
    stamp_parser = commands.add_parser("stamp")
    stamp_parser.add_argument("ipa", type=Path)
    stamp_parser.add_argument("--sdk", default="27.1")
    stamp_parser.add_argument("-o", "--output", type=Path)
    args = parser.parse_args(argv)

    if args.command == "inspect":
        result = inspect(args.ipa)
    else:
        output = args.output or args.ipa.with_name(f"{args.ipa.stem}-sdk{args.sdk}.ipa")
        result = stamp(args.ipa, args.sdk, output)
        result["verify"] = inspect(output)["slices"]
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
