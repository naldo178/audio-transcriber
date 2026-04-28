import os
import uuid
import tempfile
import yt_dlp
from groq import Groq
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

client = Groq(api_key=os.environ.get("GROQ_API_KEY"))


def transcribe_audio_file(path: str) -> str:
    with open(path, "rb") as f:
        result = client.audio.transcriptions.create(
            file=(os.path.basename(path), f),
            model="whisper-large-v3",
        )
    return result.text


@app.post("/api/transcribe")
async def transcribe_file(file: UploadFile = File(...)):
    suffix = os.path.splitext(file.filename)[-1] or ".mp3"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    try:
        text = transcribe_audio_file(tmp_path)
        return {"text": text}
    finally:
        os.remove(tmp_path)


class LinkPayload(BaseModel):
    url: str


@app.post("/api/transcribe-link")
async def transcribe_link(payload: LinkPayload):
    tmp_path = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4()}.mp3")
    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": tmp_path,
        "quiet": True,
        "no_warnings": True,
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "128",
        }],
    }
    actual_path = tmp_path
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(payload.url, download=True)
            resolved = ydl.prepare_filename(info)
            mp3_candidate = os.path.splitext(resolved)[0] + ".mp3"
            if os.path.exists(mp3_candidate):
                actual_path = mp3_candidate
            elif os.path.exists(resolved):
                actual_path = resolved
        if not os.path.exists(actual_path):
            raise HTTPException(status_code=422, detail="Audio download failed.")
        text = transcribe_audio_file(actual_path)
        return {"text": text, "source_url": payload.url, "title": info.get("title", "")}
    except yt_dlp.utils.DownloadError as e:
        raise HTTPException(status_code=422, detail=f"yt-dlp error: {str(e)}")
    finally:
        for path in [tmp_path, actual_path]:
            if path and os.path.exists(path):
                os.remove(path)
