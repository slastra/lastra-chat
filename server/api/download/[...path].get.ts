import { join } from 'path'
import { existsSync, createReadStream } from 'fs'

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

    // Construct the file path (path already starts with uploads/)
    const filePath = join(process.cwd(), 'public', path)

    // Check if file exists
    if (!existsSync(filePath)) {
      throw createError({
        statusCode: 404,
        statusMessage: 'File not found'
      })
    }

    // Set headers for download with original filename
    if (originalName && typeof originalName === 'string') {
      // Sanitize filename to prevent header injection
      const sanitizedName = originalName.replace(/[\r\n]/g, '')
      setHeader(event, 'Content-Disposition', `attachment; filename="${sanitizedName}"`)
    }

    // Set content type as octet-stream to force download
    setHeader(event, 'Content-Type', 'application/octet-stream')

    // Stream the file
    return sendStream(event, createReadStream(filePath))
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
