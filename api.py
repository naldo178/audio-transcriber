import os
import uuid
import tempfile
import whisper
import yt_dlp
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load Whisper model once at startup
model = whisper.load_model("base")


# ─── Existing: transcribe uploaded file ───────────────────────────────────────

@app.post("/api/transcribe")
async def transcribe_file(file: UploadFile = File(...)):
    suffix = os.path.splitext(file.filename)[-1] or ".mp3"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        result = model.transcribe(tmp_path)
        return {"text": result["text"]}
    finally:
        os.remove(tmp_path)


# ─── New: transcribe from video URL ───────────────────────────────────────────

class LinkPayload(BaseModel):
    url: str


@app.post("/api/transcribe-link")
async def transcribe_link(payload: LinkPayload):
    """
    Download best audio from any yt-dlp-supported URL and transcribe it.
    Supported: YouTube, Twitter/X, Instagram, TikTok, and 1000+ sites.
    """
    tmp_path = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4()}.mp3")

    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": tmp_path,
        "quiet": True,
        "no_warnings": True,
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "128",
            }
        ],
    }

    # yt-dlp may append .mp3 automatically depending on postprocessor
    actual_path = tmp_path  # may be overridden below

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(payload.url, download=True)
            # Resolve the actual output path (yt-dlp may rename)
            resolved = ydl.prepare_filename(info)
            mp3_candidate = os.path.splitext(resolved)[0] + ".mp3"
            if os.path.exists(mp3_candidate):
                actual_path = mp3_candidate
            elif os.path.exists(resolved):
                actual_path = resolved

        if not os.path.exists(actual_path):
            raise HTTPException(status_code=422, detail="Audio download failed — file not found after extraction.")

        result = model.transcribe(actual_path)
        return {
            "text": result["text"],
            "source_url": payload.url,
            "title": info.get("title", ""),
        }

    except yt_dlp.utils.DownloadError as e:
        raise HTTPException(status_code=422, detail=f"yt-dlp error: {str(e)}")
    finally:
        for path in [tmp_path, actual_path]:
            if path and os.path.exists(path):
                os.remove(path)
