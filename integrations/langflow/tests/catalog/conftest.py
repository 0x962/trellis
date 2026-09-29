import os
import sys
from pathlib import Path

TRELLIS_ROOT = Path(os.environ["TRELLIS_ROOT"]).resolve()
sys.path.insert(0, str(TRELLIS_ROOT))
sys.path.insert(0, str(Path(os.environ["LANGFLOW_SOURCE_ROOT"]) / "src/backend"))
