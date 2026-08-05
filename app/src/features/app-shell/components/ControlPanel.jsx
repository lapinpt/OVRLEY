/**
 * Renders the control panel portion of the application interface.
 */

import { Settings2, Activity } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SidebarSettingsTab } from '@/features/scene-settings'
import { SidebarWidgetsTab } from '@/features/widget-editor'

/**
 * Renders the control panel component.
 *
 * @param {object} props - Component props.
 * @param {*} props.config - Overlay template configuration data.
 * @param {*} props.onConfigChange - Callback invoked to config change.
 * @param {object} props.widgetLiveEdits - Shared live widget edit controller.
 * @returns {JSX.Element} Rendered component output.
 */
export default function ControlPanel({ config, onConfigChange, widgetLiveEdits }) {
  return (
    <div className="flex flex-col h-full bg-card">
      <Tabs defaultValue="settings" className="flex-1 flex flex-col min-h-0">
        <div className="pb-8 shrink-0 ">
          <TabsList variant="main" className="grid w-full grid-cols-2 ">
            <TabsTrigger variant="main" value="settings" className="text-sm gap-2 cursor-pointer p-4 pt-6">
              <Settings2 className="h-4 w-4" />
              Settings
            </TabsTrigger>
            <TabsTrigger variant="main" value="widgets" className="text-sm gap-2 cursor-pointer p-4 pt-6">
              <Activity className="h-4 w-4" />
              Widgets
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-y-auto pb-4 min-h-0 [scrollbar-gutter:stable]">
          <TabsContent value="settings" className="outline-none">
            <SidebarSettingsTab config={config} onConfigChange={onConfigChange} />
          </TabsContent>

          <TabsContent value="widgets" className="mt-4 outline-none">
            <SidebarWidgetsTab widgetLiveEdits={widgetLiveEdits} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
