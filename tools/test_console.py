import json
import unittest
from unittest.mock import patch
from mqtt_console import DoorConsole

class TestConsole(unittest.TestCase):
    def setUp(self):
        self.c = DoorConsole()
        self.c.receive("availability", "online")

    def state(self, session="0123456789abcdef", retained=False):
        self.c.receive("state", json.dumps({"session": session}), retained)

    def test_retained_state_cannot_enable_unlock(self):
        self.state(retained=True)
        with self.assertRaises(ValueError): self.c.command("unlock")

    def test_sequence_and_session_changes(self):
        self.state()
        self.assertEqual(json.loads(self.c.command("status"))["seq"], 1)
        self.assertEqual(json.loads(self.c.command("unlock"))["seq"], 2)
        self.state("fedcba9876543210")
        obj = json.loads(self.c.command("status"))
        self.assertEqual(obj["seq"], 1)
        self.assertEqual(obj["session"], "fedcba9876543210")

    def test_offline_blocks_command(self):
        self.state()
        self.c.receive("availability", "offline")
        with self.assertRaises(ValueError): self.c.command("unlock")

    def test_stale_live_state_blocks_command(self):
        self.state()
        with patch("mqtt_console.time.monotonic", return_value=self.c.last_fresh_state + 13):
            with self.assertRaises(ValueError): self.c.command("unlock")

    def test_invalid_state_and_action(self):
        self.c.receive("state", "not-json")
        self.c.receive("state", "[]")
        with self.assertRaises(ValueError): self.c.command("unlock")
        self.state()
        with self.assertRaises(ValueError): self.c.command("lock")

if __name__ == "__main__": unittest.main()
