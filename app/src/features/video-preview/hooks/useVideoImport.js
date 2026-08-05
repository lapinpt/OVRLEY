/**
 * Video import - background media selection and preview management.
 */

import { clearPreviewVideo, extractVideoTelemetry, importPreviewVideo } from '@/api/backend'
import { runWithoutEditorHistory } from '@/features/undo-redo/undoHistory'
import { openSinglePath } from '@/lib/file-dialog'
import useStore from '@/store/useStore'

const DEBUG_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp'])

function pathExtension(path) {
  return typeof path === 'string' ? path.split('.').pop()?.toLowerCase() || '' : ''
}

async function extractAndStoreVideoTelemetry(filePath) {
  try {
    const response = await extractVideoTelemetry(filePath)
    if (response?.parsed_activity) {
      await runWithoutEditorHistory(useStore, () => useStore.getState().loadVideoTelemetry(response.parsed_activity))
    }
  } catch (error) {
    console.warn('MP4 telemetry extraction failed (non-fatal):', error)
  }
}

export default function useVideoImport({ debugModeEnabled = false, onSetBackgroundMode }) {
  const importedVideoPath = useStore((state) => state.importedVideoPath)
  const importedBackgroundImagePath = useStore((state) => state.importedBackgroundImagePath)
  const setImportedVideo = useStore((state) => state.setImportedVideo)
  const setImportedBackgroundImage = useStore((state) => state.setImportedBackgroundImage)
  const clearImportedVideo = useStore((state) => state.clearImportedVideo)
  const setImportingVideo = useStore((state) => state.setImportingVideo)
  const setConfig = useStore((state) => state.setConfig)
  const clearVideoTelemetry = useStore((state) => state.clearVideoTelemetry)

  const importedVideoFilename = importedVideoPath ? importedVideoPath.split(/[/\\]/).pop() : null
  const importedBackgroundImageFilename = importedBackgroundImagePath ? importedBackgroundImagePath.split(/[/\\]/).pop() : null
  const importedMediaFilename = importedBackgroundImageFilename || importedVideoFilename

  const handleImportVideo = async () => {
    try {
      const selected = await openSinglePath(
        [
          {
            name: debugModeEnabled ? 'Video or Image' : 'Video',
            extensions: debugModeEnabled ? ['mp4', 'mov', 'mkv', 'png', 'jpg', 'jpeg', 'webp'] : ['mp4', 'mov', 'mkv'],
          },
        ],
        { lastDirectoryKey: 'last-video-import-dir' },
      )
      if (!selected) {
        return
      }

      setImportingVideo(true)

      if (debugModeEnabled && DEBUG_IMAGE_EXTENSIONS.has(pathExtension(selected))) {
        if (importedVideoPath) {
          await clearPreviewVideo()
        }
        setImportedBackgroundImage(selected)
        onSetBackgroundMode?.('image')
        return
      }

      clearVideoTelemetry()

      const response = await importPreviewVideo(selected)
      const metadata = {
        ...response.metadata,
        importId: response.importId,
        previewUrl: response.previewUrl,
        previewWarnings: response.warnings ?? [],
      }
      const currentConfig = useStore.getState().config
      if (!currentConfig?.scene) {
        throw new Error('Cannot import video without an active template scene')
      }

      await runWithoutEditorHistory(useStore, () => {
        const importedVideoResolution = setImportedVideo(metadata)
        setConfig({
          ...currentConfig,
          scene: {
            ...currentConfig.scene,
            ...(metadata.fps ? { fps: Math.round(metadata.fps) } : {}),
            width: importedVideoResolution.width,
            height: importedVideoResolution.height,
          },
        })
      })
      onSetBackgroundMode?.('video')

      void extractAndStoreVideoTelemetry(selected)
    } catch (err) {
      console.error('Failed to import background media:', err)
    } finally {
      setImportingVideo(false)
    }
  }

  const handleClearImportedVideo = async () => {
    try {
      if (importedVideoPath) {
        await clearPreviewVideo()
      }
    } catch (err) {
      console.error('Failed to clear preview video:', err)
    } finally {
      clearImportedVideo()
      onSetBackgroundMode?.('checker')
    }
  }

  return {
    debugModeEnabled,
    importedBackgroundImageFilename,
    importedMediaFilename,
    importedVideoFilename,
    handleImportVideo,
    clearImportedVideo: handleClearImportedVideo,
  }
}
