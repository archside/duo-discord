import plistlib
import struct
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import duo_ipa  # noqa: E402


def slice_bytes(sdk: str, cryptid: int = 0) -> bytes:
    name = b"@executable_path/Frameworks/Unbound.dylib\0"
    name += b"\0" * (-(24 + len(name)) % 8)
    commands = [
        struct.pack("<IIIIII", duo_ipa.LC_BUILD_VERSION, 24, 2, duo_ipa.encode_version("16.0"), duo_ipa.encode_version(sdk), 0),
        struct.pack("<IIIIII", duo_ipa.LC_LOAD_DYLIB, 24 + len(name), 24, 2, 0x10000, 0x10000) + name,
        struct.pack("<IIIIII", duo_ipa.LC_ENCRYPTION_INFO_64, 24, 0x4000, 0x1000, cryptid, 0),
    ]
    body = b"".join(commands)
    header = struct.pack("<IiiIIIII", duo_ipa.MH_MAGIC_64, 0x0100000C, 0, 2, len(commands), len(body), 0, 0)
    return header + body + b"\xAA" * 64


def fat(*slices: bytes) -> bytes:
    header = struct.pack(">II", duo_ipa.FAT_MAGIC, len(slices))
    offset, table, payload = 0x1000, b"", b""
    for s in slices:
        table += struct.pack(">iiIII", 0x0100000C, 0, offset + len(payload), len(s), 14)
        payload += s + b"\0" * (-len(s) % 0x1000)
    return (header + table).ljust(0x1000, b"\0") + payload


def make_ipa(path: Path, executable: bytes) -> None:
    info = {"CFBundleExecutable": "Discord", "CFBundleIdentifier": "com.hammerandchisel.discord", "DTSDKName": "iphoneos26.2"}
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("Payload/", b"")
        z.writestr("Payload/Discord.app/Info.plist", plistlib.dumps(info, fmt=plistlib.FMT_BINARY))
        z.writestr("Payload/Discord.app/Discord", executable)
        z.writestr("Payload/Discord.app/Frameworks/Unbound.dylib", slice_bytes("27.0"))
        z.writestr("Payload/Discord.app/PlugIns/Share.appex/Share", slice_bytes("26.2"))


class DuoIpaTest(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.ipa = self.dir / "Unbound.ipa"
        make_ipa(self.ipa, fat(slice_bytes("26.2"), slice_bytes("26.2")))

    def test_inspect_reports_the_sdk_tier_and_injected_tweak(self):
        report = duo_ipa.inspect(self.ipa)
        self.assertEqual([s["sdk"] for s in report["slices"]], ["26.2", "26.2"])
        self.assertEqual(report["duoWindowTier"], "phone-sized window when open (26.x SDK or earlier)")
        self.assertIn("@executable_path/Frameworks/Unbound.dylib", report["nonSystemDylibs"])
        self.assertEqual(report["info"]["DTSDKName"], "iphoneos26.2")

    def test_stamp_changes_only_the_main_executable_sdk(self):
        out = self.dir / "out.ipa"
        original = self.ipa.read_bytes()
        result = duo_ipa.stamp(self.ipa, "27.1", out)
        self.assertEqual(result["sdkBefore"], ["26.2", "26.2"])
        self.assertEqual(self.ipa.read_bytes(), original)

        report = duo_ipa.inspect(out)
        self.assertEqual([(s["sdk"], s["minos"]) for s in report["slices"]], [("27.1", "16.0"), ("27.1", "16.0")])
        self.assertEqual(report["duoWindowTier"], "full display (27.1+ SDK)")

        with zipfile.ZipFile(self.ipa) as a, zipfile.ZipFile(out) as b:
            self.assertEqual(a.namelist(), b.namelist())
            changed = [n for n in a.namelist() if a.read(n) != b.read(n)]
            self.assertEqual(changed, ["Payload/Discord.app/Discord"])
            diff = [i for i, (x, y) in enumerate(zip(a.read(changed[0]), b.read(changed[0]))) if x != y]
            self.assertTrue(diff and len(diff) <= 4 * 2, f"unexpected byte changes at {diff}")

    def test_stamp_is_idempotent(self):
        once, twice = self.dir / "once.ipa", self.dir / "twice.ipa"
        duo_ipa.stamp(self.ipa, "27.1", once)
        duo_ipa.stamp(once, "27.1", twice)
        with zipfile.ZipFile(once) as a, zipfile.ZipFile(twice) as b:
            self.assertEqual(a.read("Payload/Discord.app/Discord"), b.read("Payload/Discord.app/Discord"))

    def test_stamp_back_to_the_original_sdk_restores_the_executable(self):
        up, down = self.dir / "up.ipa", self.dir / "down.ipa"
        duo_ipa.stamp(self.ipa, "27.1", up)
        duo_ipa.stamp(up, "26.2", down)
        with zipfile.ZipFile(self.ipa) as a, zipfile.ZipFile(down) as b:
            self.assertEqual(a.read("Payload/Discord.app/Discord"), b.read("Payload/Discord.app/Discord"))

    def test_refuses_to_overwrite_the_rollback_copy(self):
        with self.assertRaisesRegex(ValueError, "rollback"):
            duo_ipa.stamp(self.ipa, "27.1", self.ipa)

    def test_refuses_an_encrypted_executable(self):
        encrypted = self.dir / "enc.ipa"
        make_ipa(encrypted, slice_bytes("26.2", cryptid=1))
        with self.assertRaisesRegex(ValueError, "encrypted"):
            duo_ipa.stamp(encrypted, "27.1", self.dir / "x.ipa")


if __name__ == "__main__":
    unittest.main()
