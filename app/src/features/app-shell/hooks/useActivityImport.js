/**
 * Activity import - GPX/FIT/SRT/IGC/CSV file selection and import.
 */

import { useCallback } from 'react'
import { hasTauriRuntime } from '@/api/backend'
import { useActivityStore } from '@/hooks/useAppStoreSelectors'
import importActivityFile, { importCsvActivityPath } from '@/lib/activity/import-activity'
import { fileFromSelectedPath, openSinglePath, selectBrowserFile } from '@/lib/file-dialog'
import useStore from '@/store/useStore'

export default function useActivityImport() {
  const { activityFilename, setErrorMessage, setProcessing } = useActivityStore()

  const handleActivityFileOpen = useCallback(async () => {
    try {
      let importSelection = null

      if (hasTauriRuntime()) {
        const selectedPath = await openSinglePath([{ name: 'Activity', extensions: ['gpx', 'fit', 'srt', 'igc', 'csv'] }], {
          lastDirectoryKey: 'last-activity-import-dir',
        })

        if (typeof selectedPath === 'string') {
          if (selectedPath.toLowerCase().endsWith('.csv')) {
            importSelection = () => importCsvActivityPath(selectedPath, useStore.getState())
          } else {
            const selectedFile = await fileFromSelectedPath(selectedPath, 'activity')
            importSelection = () => importActivityFile(selectedFile, useStore.getState())
          }
        }
      } else {
        const selectedFile = await selectBrowserFile('.gpx,.fit,.srt,.igc')
        if (selectedFile) importSelection = () => importActivityFile(selectedFile, useStore.getState())
      }

      if (!importSelection) return

      setProcessing(true)
      await importSelection()
    } catch (error) {
      console.error('Activity selection failed:', error)
      setErrorMessage(`Activity selection failed: ${error.message}`)
    } finally {
      setProcessing(false)
    }
  }, [setErrorMessage, setProcessing])

  return {
    activityFilename,
    handleActivityFileOpen,
  }
}
