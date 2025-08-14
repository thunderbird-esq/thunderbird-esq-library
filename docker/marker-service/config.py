"""
Configuration for Marker PDF Conversion Service
"""

import os

# Service configuration
SERVICE_NAME = "marker-pdf-service"
SERVICE_VERSION = "1.0.0"

# API configuration
MAX_FILE_SIZE_MB = 50
SUPPORTED_FORMATS = [".pdf"]

# Processing configuration
DEFAULT_BATCH_MULTIPLIER = 2
DEFAULT_LANGUAGES = ["English"]
MAX_PAGES_PER_REQUEST = 500

# Model configuration
MODEL_CACHE_DIR = os.getenv("MODEL_CACHE_DIR", "/tmp/marker_models")
GPU_ENABLED = os.getenv("TORCH_DEVICE", "cpu") != "cpu"

# Timeout configuration
PROCESSING_TIMEOUT_SECONDS = int(os.getenv("PROCESSING_TIMEOUT", "300"))  # 5 minutes default

# Health check configuration
HEALTH_CHECK_INTERVAL = 30

# Logging configuration
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"