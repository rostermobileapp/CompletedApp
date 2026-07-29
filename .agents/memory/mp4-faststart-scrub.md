---
name: MP4 faststart required for scroll-scrub
description: Any MP4 used for scroll-scrubbing (setting video.currentTime programmatically) must have its moov atom at the front of the file, not the end.
---

# MP4 faststart required for scroll-scrub

## The rule
Before adding any MP4 to `client/public/` for use as a scroll-scrubbed or seekable video element, run:
```
ffmpeg -i input.mp4 -c copy -movflags +faststart output.mp4
```

## Why
Screen recorders and many export tools write the `moov` atom (seek index, duration metadata) at the **end** of the MP4 container. Browsers must download the entire file before they can resolve `video.duration` or honor `video.currentTime` assignments. A 9 MB file with `moov` at the end means every `currentTime` seek is silently dropped until the full download completes — the video appears frozen/broken.

`-movflags +faststart` rewrites the file with `moov` at byte ~32, so the browser can seek from the very first HTTP response chunk.

## How to apply
Verify atom order after conversion:
```python
import struct
with open('file.mp4', 'rb') as f:
    data = f.read(100000)
    offset = 0
    while offset < len(data) - 8:
        size = struct.unpack('>I', data[offset:offset+4])[0]
        name = data[offset+4:offset+8].decode('ascii', errors='replace')
        print(f'offset={offset}, type={name}')
        if size < 8: break
        offset += size
```
Expected: `ftyp` → `moov` → `free` → `mdat`. Bad: `ftyp` → `free` → `mdat` → (moov at end).
