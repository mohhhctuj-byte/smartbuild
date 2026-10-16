# File: tests/test_cloud_engine.py
"""
Unit tests for SmartBuild Cloud Engine
"""

import unittest
import os
import json
from src.cloud_engine import CloudEngine

class TestCloudEngine(unittest.TestCase):
    def setUp(self):
        self.test_config = {
            "workspace": "test-cloud-workspace",
            "version": "1.0.0"
        }
        with open("test_workspace.json", "w") as f:
            json.dump(self.test_config, f)
            
    def tearDown(self):
        if os.path.exists("test_workspace.json"):
            os.remove("test_workspace.json")

    def test_engine_initialization(self):
        engine = CloudEngine("test_workspace.json")
        self.assertEqual(engine.config["workspace"], "test-cloud-workspace")

    def test_execute_build(self):
        engine = CloudEngine("test_workspace.json")
        response = engine.execute_build({"task": "unit_test_run"})
        self.assertEqual(response["status"], "success")
        self.assertEqual(response["task_executed"], "unit_test_run")
        self.assertIn("metrics", response)

if __name__ == "__main__":
    unittest.main()