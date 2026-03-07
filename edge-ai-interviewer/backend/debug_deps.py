import sys
import os

print("Python version:", sys.version)

try:
    import whisper
    print("whisper module imported successfully")
    print("whisper file:", whisper.__file__)
except ImportError as e:
    print("whisper ImportError:", e)
except Exception as e:
    print("whisper main Exception:", e)

try:
    import torch
    print("torch version:", torch.__version__)
    print("CUDA available:", torch.cuda.is_available())
except Exception as e:
    print("torch error:", e)
