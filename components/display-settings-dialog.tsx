'use client';

import { useState, useEffect } from 'react';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Settings, Save } from 'lucide-react';
import { updateViewerSettingsAction } from '@/app/actions';
import type { DisplayModeSettings } from '@/lib/types/viewer';

interface DisplaySettingsDialogProps {
  viewerId: string;
  currentSettings?: DisplayModeSettings;
}

type SettingsState = {
  success?: boolean;
  error?: string;
  message?: string;
};

export function DisplaySettingsDialog({ viewerId, currentSettings }: DisplaySettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [state, action, isPending] = useActionState<SettingsState, FormData>(
    updateViewerSettingsAction,
    {}
  );

  // Default values
  const defaults = {
    standardDuration: currentSettings?.standardMode?.duration ?? 5,
    standardRotationSpeed: currentSettings?.standardMode?.rotationSpeed ?? 0.5,
    standardEnabled: currentSettings?.standardMode?.enabled ?? true,
    
    newUploadDuration: currentSettings?.newUploadMode?.duration ?? 8,
    newUploadHighlight: currentSettings?.newUploadMode?.highlightEffect ?? 'glow',
    newUploadEnabled: currentSettings?.newUploadMode?.enabled ?? true,
    
    showcaseEnabled: currentSettings?.showcaseMode?.enabled ?? true,
    showcaseFrequency: currentSettings?.showcaseMode?.frequency ?? 18,
    showcaseDuration: currentSettings?.showcaseMode?.duration ?? 60,
    showcaseInterval: currentSettings?.showcaseMode?.textureInterval ?? 1.5,
    
    detailedDuration: currentSettings?.detailedMode?.duration ?? 8,
    
    pauseOnTouch: currentSettings?.interactionSettings?.pauseOnTouch ?? true,
    manualNavigation: currentSettings?.interactionSettings?.manualNavigation ?? true,
    autoResumeAfter: currentSettings?.interactionSettings?.autoResumeAfter ?? 15
  };

  useEffect(() => {
    if (state.success) {
      setTimeout(() => setOpen(false), 1000);
    }
  }, [state.success]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="h-3 w-3 mr-2" />
          Display Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Museum Display Settings</DialogTitle>
          <DialogDescription>
            Configure timing and behavior optimized for museum exhibitions
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-6">
          <input type="hidden" name="viewerId" value={viewerId} />

          {/* Standard Mode */}
          <div className="space-y-3 p-4 border rounded-lg">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              Standard Mode
              <span className="text-xs font-normal text-gray-500">Baseline viewing</span>
            </h3>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="standardDuration" className="text-xs">Duration (seconds)</Label>
                <Input
                  id="standardDuration"
                  name="standardDuration"
                  type="number"
                  min="1"
                  max="30"
                  step="0.5"
                  defaultValue={defaults.standardDuration}
                  className="h-8"
                />
                <p className="text-xs text-gray-500">Research shows 4-7 sec is optimal</p>
              </div>
              
              <div className="space-y-1">
                <Label htmlFor="standardRotationSpeed" className="text-xs">Rotation Speed</Label>
                <Input
                  id="standardRotationSpeed"
                  name="standardRotationSpeed"
                  type="number"
                  min="0"
                  max="2"
                  step="0.1"
                  defaultValue={defaults.standardRotationSpeed}
                  className="h-8"
                />
              </div>
            </div>
          </div>

          {/* New Upload Mode */}
          <div className="space-y-3 p-4 border rounded-lg bg-blue-50/50">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                ✨ New Upload Highlight
                <span className="text-xs font-normal text-gray-500">Celebrate new textures</span>
              </h3>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  name="newUploadEnabled"
                  defaultChecked={defaults.newUploadEnabled}
                  className="rounded"
                />
                Enabled
              </label>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="newUploadDuration" className="text-xs">Duration (seconds)</Label>
                <Input
                  id="newUploadDuration"
                  name="newUploadDuration"
                  type="number"
                  min="3"
                  max="20"
                  step="1"
                  defaultValue={defaults.newUploadDuration}
                  className="h-8"
                />
                <p className="text-xs text-gray-500">Longer viewing for new work</p>
              </div>
              
              <div className="space-y-1">
                <Label htmlFor="newUploadHighlight" className="text-xs">Highlight Effect</Label>
                <select
                  id="newUploadHighlight"
                  name="newUploadHighlight"
                  defaultValue={defaults.newUploadHighlight}
                  className="h-8 w-full rounded-md border border-gray-300 px-3 text-sm"
                >
                  <option value="glow">Glow</option>
                  <option value="pulse">Pulse</option>
                  <option value="border">Border</option>
                  <option value="none">None</option>
                </select>
              </div>
            </div>
          </div>

          {/* Showcase Mode */}
          <div className="space-y-3 p-4 border rounded-lg bg-yellow-50/50">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                ⚡ Showcase Mode
                <span className="text-xs font-normal text-gray-500">Periodic attention burst</span>
              </h3>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  name="showcaseEnabled"
                  defaultChecked={defaults.showcaseEnabled}
                  className="rounded"
                />
                Enabled
              </label>
            </div>
            
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="showcaseFrequency" className="text-xs">Frequency (min)</Label>
                <Input
                  id="showcaseFrequency"
                  name="showcaseFrequency"
                  type="number"
                  min="5"
                  max="60"
                  step="1"
                  defaultValue={defaults.showcaseFrequency}
                  className="h-8"
                />
              </div>
              
              <div className="space-y-1">
                <Label htmlFor="showcaseDuration" className="text-xs">Duration (sec)</Label>
                <Input
                  id="showcaseDuration"
                  name="showcaseDuration"
                  type="number"
                  min="30"
                  max="180"
                  step="10"
                  defaultValue={defaults.showcaseDuration}
                  className="h-8"
                />
              </div>
              
              <div className="space-y-1">
                <Label htmlFor="showcaseInterval" className="text-xs">Speed (sec)</Label>
                <Input
                  id="showcaseInterval"
                  name="showcaseInterval"
                  type="number"
                  min="0.5"
                  max="5"
                  step="0.5"
                  defaultValue={defaults.showcaseInterval}
                  className="h-8"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500">Fast rotation every 15-20 minutes catches attention</p>
          </div>

          {/* Interaction Settings */}
          <div className="space-y-3 p-4 border rounded-lg">
            <h3 className="font-semibold text-sm">User Interaction</h3>
            
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="pauseOnTouch"
                  defaultChecked={defaults.pauseOnTouch}
                  className="rounded"
                />
                Pause on touch/click
              </label>
              
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="manualNavigation"
                  defaultChecked={defaults.manualNavigation}
                  className="rounded"
                />
                Show navigation arrows
              </label>
              
              <div className="space-y-1 ml-6">
                <Label htmlFor="autoResumeAfter" className="text-xs">Auto-resume after (seconds)</Label>
                <Input
                  id="autoResumeAfter"
                  name="autoResumeAfter"
                  type="number"
                  min="5"
                  max="60"
                  step="5"
                  defaultValue={defaults.autoResumeAfter}
                  className="h-8 w-32"
                />
              </div>
            </div>
          </div>

          {state.error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
              {state.error}
            </div>
          )}

          {state.success && (
            <div className="p-3 text-sm text-green-600 bg-green-50 rounded-md">
              Settings saved successfully!
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isPending}>
            <Save className="h-4 w-4 mr-2" />
            {isPending ? 'Saving...' : 'Save Settings'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
