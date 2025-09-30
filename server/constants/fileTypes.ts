export interface AllowedFileType {
  ext: string
  maxSize: number
  category: 'image' | 'audio' | 'video' | 'document' | 'archive'
}

export const ALLOWED_FILE_TYPES: Record<string, AllowedFileType> = {
  'image/jpeg': { ext: '.jpg', maxSize: 10 * 1024 * 1024, category: 'image' },
  'image/png': { ext: '.png', maxSize: 10 * 1024 * 1024, category: 'image' },
  'image/gif': { ext: '.gif', maxSize: 10 * 1024 * 1024, category: 'image' },
  'image/webp': { ext: '.webp', maxSize: 10 * 1024 * 1024, category: 'image' },
  'image/svg+xml': { ext: '.svg', maxSize: 2 * 1024 * 1024, category: 'image' },

  'audio/mpeg': { ext: '.mp3', maxSize: 25 * 1024 * 1024, category: 'audio' },
  'audio/wav': { ext: '.wav', maxSize: 25 * 1024 * 1024, category: 'audio' },
  'audio/ogg': { ext: '.ogg', maxSize: 25 * 1024 * 1024, category: 'audio' },
  'audio/mp4': { ext: '.m4a', maxSize: 25 * 1024 * 1024, category: 'audio' },
  'audio/webm': { ext: '.webm', maxSize: 25 * 1024 * 1024, category: 'audio' },

  'video/mp4': { ext: '.mp4', maxSize: 100 * 1024 * 1024, category: 'video' },
  'video/webm': { ext: '.webm', maxSize: 100 * 1024 * 1024, category: 'video' },
  'video/quicktime': { ext: '.mov', maxSize: 100 * 1024 * 1024, category: 'video' },

  'application/pdf': { ext: '.pdf', maxSize: 10 * 1024 * 1024, category: 'document' },
  'text/plain': { ext: '.txt', maxSize: 1 * 1024 * 1024, category: 'document' },
  'text/markdown': { ext: '.md', maxSize: 1 * 1024 * 1024, category: 'document' },
  'application/msword': { ext: '.doc', maxSize: 10 * 1024 * 1024, category: 'document' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: '.docx', maxSize: 10 * 1024 * 1024, category: 'document' },

  'application/zip': { ext: '.zip', maxSize: 50 * 1024 * 1024, category: 'archive' },
  'application/x-rar-compressed': { ext: '.rar', maxSize: 50 * 1024 * 1024, category: 'archive' },
  'application/x-7z-compressed': { ext: '.7z', maxSize: 50 * 1024 * 1024, category: 'archive' },
  'application/x-tar': { ext: '.tar', maxSize: 50 * 1024 * 1024, category: 'archive' },
  'application/gzip': { ext: '.gz', maxSize: 50 * 1024 * 1024, category: 'archive' }
}
