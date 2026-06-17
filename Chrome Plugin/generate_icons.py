import zlib
import struct
import os

def create_png(width, height):
    # Signature
    png = bytearray([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    
    # IHDR chunk
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    png += struct.pack('>I', 13) + b'IHDR' + ihdr_data + struct.pack('>I', zlib.crc32(b'IHDR' + ihdr_data))
    
    # Generate image data (smooth red record icon with a glowing center)
    cx, cy = width / 2.0, height / 2.0
    r_outer = min(width, height) * 0.45
    r_inner = min(width, height) * 0.22
    
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0) # Filter byte 0
        for x in range(width):
            dx = x + 0.5 - cx
            dy = y + 0.5 - cy
            dist = (dx*dx + dy*dy)**0.5
            
            if dist <= r_inner:
                # Solid bright red record button center
                raw_data.extend([255, 60, 60, 255])
            elif dist <= r_outer:
                # Semi-transparent outer red ring with glowing falloff
                ratio = (dist - r_inner) / (r_outer - r_inner)
                # Outer ring edge is transparent, fade alpha from 200 to 0
                alpha = int(200 * (1 - ratio))
                # Add a slight ring structure
                if ratio > 0.6:
                    raw_data.extend([255, 60, 60, max(0, alpha)])
                else:
                    raw_data.extend([255, 100, 100, max(0, alpha // 2)])
            else:
                # Transparent background
                raw_data.extend([0, 0, 0, 0])
                
    idat_data = zlib.compress(raw_data)
    png += struct.pack('>I', len(idat_data)) + b'IDAT' + idat_data + struct.pack('>I', zlib.crc32(b'IDAT' + idat_data))
    
    # IEND chunk
    png += struct.pack('>I', 0) + b'IEND' + struct.pack('>I', zlib.crc32(b'IEND'))
    return png

os.makedirs('icons', exist_ok=True)
for size in [16, 32, 48, 128]:
    with open(f'icons/icon{size}.png', 'wb') as f:
        f.write(create_png(size, size))
    print(f"Generated icons/icon{size}.png")
