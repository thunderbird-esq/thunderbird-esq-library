from fastapi import FastAPI, File, UploadFile, HTTPException
from marker.models import load_all_models
from marker.convert import convert_single_pdf
from marker.logger import configure_logging
import tempfile
import os
from typing import Dict, Any

configure_logging()
app = FastAPI(title="Marker PDF Conversion Service")

# Load models on startup (cached)
models = None

@app.on_event("startup")
async def load_models():
    global models
    models = load_all_models()

@app.post("/convert")
async def convert_pdf(file: UploadFile = File(...)) -> Dict[str, Any]:
    """Convert PDF to Markdown using Marker library."""
    
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    
    try:
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_file_path = tmp_file.name
        
        # Convert using Marker
        full_text, images, out_meta = convert_single_pdf(
            tmp_file_path, 
            models, 
            max_pages=None,
            langs=["English"],
            batch_multiplier=2
        )
        
        # Cleanup
        os.unlink(tmp_file_path)
        
        return {
            "success": True,
            "markdown_content": full_text,
            "metadata": {
                "page_count": out_meta.get("page_count", 0),
                "language": out_meta.get("language", "en"),
                "processing_time": out_meta.get("processing_time", 0)
            }
        }
        
    except Exception as e:
        # Cleanup on error
        if 'tmp_file_path' in locals():
            try:
                os.unlink(tmp_file_path)
            except:
                pass
        
        raise HTTPException(status_code=500, detail=f"Conversion failed: {str(e)}")

@app.get("/health")
async def health_check():
    return {"status": "healthy", "models_loaded": models is not None}