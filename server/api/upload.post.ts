import { randomUUID } from 'crypto'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

const ALLOWED_TYPES = {
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

export default defineEventHandler(async (event) => {
  try {
    const formData = await readMultipartFormData(event)

    if (!formData || formData.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No files uploaded'
      })
    }

    const uploadedFiles = []
    const now = new Date()
    const year = now.getFullYear().toString()
    const month = (now.getMonth() + 1).toString().padStart(2, '0')

    // Create upload directory
    const uploadDir = join(process.cwd(), 'public', 'uploads', year, month)
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true })
    }

    for (const file of formData) {
      if (!file.filename || !file.data || !file.type) {
        continue
      }

      // Validate file type
      const allowedType = ALLOWED_TYPES[file.type as keyof typeof ALLOWED_TYPES]
      if (!allowedType) {
        throw createError({
          statusCode: 400,
          statusMessage: `File type ${file.type} is not allowed`
        })
      }

      // Validate file size
      if (file.data.length > allowedType.maxSize) {
        throw createError({
          statusCode: 400,
          statusMessage: `File ${file.filename} exceeds maximum size of ${Math.round(allowedType.maxSize / 1024 / 1024)}MB`
        })
      }

      // Generate unique filename
      const fileId = randomUUID()
      const timestamp = Date.now()
      const extension = allowedType.ext
      const storageFilename = `${fileId}-${timestamp}${extension}`
      const filePath = join(uploadDir, storageFilename)

      // Save file
      await writeFile(filePath, file.data)

      // Create file metadata
      const fileUrl = `/uploads/${year}/${month}/${storageFilename}`
      uploadedFiles.push({
        url: fileUrl,
        originalName: file.filename,
        mimeType: file.type,
        size: file.data.length,
        type: allowedType.category,
        uploadedAt: now.toISOString()
      })
    }

    return {
      success: true,
      files: uploadedFiles
    }
  } catch (error: unknown) {
    console.error('[Upload] Error:', error)

    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Upload failed'
    })
  }
})
