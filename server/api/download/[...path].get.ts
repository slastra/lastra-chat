import { createReadStream } from 'fs'
import { resolve } from 'path'

export default defineEventHandler(async (event) => {
  try {
    const path = getRouterParam(event, 'path')
    const originalName = getQuery(event).name

    if (!path) {
      throw createError({
        statusCode: 400,
        statusMessage: 'File path is required'
      })
    }

    // Get the file path using nuxt-file-storage
    // Path format: uploads/YYYY/MM/filename
    const pathParts = path.split('/')
    if (pathParts.length < 4 || pathParts[0] !== 'uploads') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid file path format'
      })
    }

    // Construct storage path
    const storagePath = `/${pathParts[1]}/${pathParts[2]}`
    const filename = pathParts[3]

    // Get file using nuxt-file-storage
    const filePath = await getFileLocally(filename ?? '', storagePath)

    if (!filePath) {
      throw createError({
        statusCode: 404,
        statusMessage: 'File not found'
      })
    }

    // Resolve absolute path using the storage mount from config
    // In dev: ./uploads; In prod: could be different
    const storageMountPath = process.env.FILE_STORAGE_MOUNT || './uploads'
    const absolutePath = resolve(process.cwd(), storageMountPath, storagePath.slice(1), filename ?? '')

    // Set headers for download with original filename
    if (originalName && typeof originalName === 'string') {
      // Sanitize filename to prevent header injection
      const sanitizedName = originalName.replace(/[\r\n]/g, '')
      setHeader(event, 'Content-Disposition', `attachment; filename="${sanitizedName}"`)
    }

    // Set content type as octet-stream to force download
    setHeader(event, 'Content-Type', 'application/octet-stream')

    // Stream the file
    return sendStream(event, createReadStream(absolutePath))
  } catch (error: unknown) {
    console.error('[Download] Error:', error)

    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Download failed'
    })
  }
})
