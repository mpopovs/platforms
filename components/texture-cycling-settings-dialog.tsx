'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings } from 'lucide-react';
import type { TextureCyclingSettings } from '@/lib/types/viewer';

interface TextureCyclingSettingsDialogProps {
  viewerId: string;
  currentSettings?: TextureCyclingSettings;
  onSave?: () => void;
}

export function TextureCyclingSettingsDialog({
  viewerId,
  currentSettings,
  onSave
}: TextureCyclingSettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(currentSettings?.enabled ?? true);
  const [priorityTimeWindow, setPriorityTimeWindow] = useState(currentSettings?.priorityTimeWindow ?? 2);
  const [priorityRepeatCount, setPriorityRepeatCount] = useState(currentSettings?.priorityRepeatCount ?? 6);
  const [standardDisplayDuration, setStandardDisplayDuration] = useState(currentSettings?.standardDisplayDuration ?? 5);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');

    try {
      const settings: TextureCyclingSettings = {
        enabled,
        priorityTimeWindow,
        priorityRepeatCount,
        standardDisplayDuration
      };

      const response = await fetch('/api/update-viewer-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          viewerId,
          textureCycling: settings
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      setOpen(false);
      if (onSave) onSave();
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="h-3 w-3 mr-1" />
          Texture Cycling
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Texture Cycling Settings</DialogTitle>
          <DialogDescription>
            Configure how textures are displayed across multiple 3D models
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="enabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded"
            />
            <Label htmlFor="enabled" className="font-normal cursor-pointer">
              Enable texture cycling mode
            </Label>
          </div>

          {enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="priorityTimeWindow">
                  Priority Time Window (hours)
                </Label>
                <Input
                  id="priorityTimeWindow"
                  type="number"
                  min="0.5"
                  max="24"
                  step="0.5"
                  value={priorityTimeWindow}
                  onChange={(e) => setPriorityTimeWindow(parseFloat(e.target.value))}
                />
                <p className="text-xs text-gray-500">
                  Textures uploaded within this time are considered "recent"
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="priorityRepeatCount">
                  Priority Repeat Count
                </Label>
                <Input
                  id="priorityRepeatCount"
                  type="number"
                  min="1"
                  max="20"
                  step="1"
                  value={priorityRepeatCount}
                  onChange={(e) => setPriorityRepeatCount(parseInt(e.target.value))}
                />
                <p className="text-xs text-gray-500">
                  How many times to show recent textures before cycling all
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="standardDisplayDuration">
                  Display Duration (seconds)
                </Label>
                <Input
                  id="standardDisplayDuration"
                  type="number"
                  min="1"
                  max="60"
                  step="1"
                  value={standardDisplayDuration}
                  onChange={(e) => setStandardDisplayDuration(parseInt(e.target.value))}
                />
                <p className="text-xs text-gray-500">
                  How long to display each texture
                </p>
              </div>
            </>
          )}

          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
              {error}
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
            <p className="text-xs text-blue-900">
              <strong>How it works:</strong> Recent textures (uploaded within the time window) will be shown {priorityRepeatCount}x, 
              then the display will cycle through all textures from all models.
            </p>
          </div>

          <Button onClick={handleSave} className="w-full" disabled={saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
