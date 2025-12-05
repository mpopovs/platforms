'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings, Save, Eye, RefreshCw, Code, Copy, Check, Globe } from 'lucide-react';
import type { TextureCyclingSettings, ViewerModelRow } from '@/lib/types/viewer';

interface ViewerSettingsDialogProps {
  viewerId: string;
  currentSettings?: TextureCyclingSettings;
  widgetEnabled?: boolean;
  storageMode?: 'server' | 'local' | 'hybrid';
  enableArucoDetection?: boolean;
  defaultModelId?: string;
  rotationSpeed?: number;
  backgroundColor?: string;
  showModelName?: boolean;
  models?: ViewerModelRow[];
  onSave?: () => void;
  currentPin?: string | null;
  onGeneratePin?: () => Promise<void>;
  embedToken?: string;
  onGenerateEmbed?: () => Promise<void>;
  embedCode?: string;
}

export function ViewerSettingsDialog({
  viewerId,
  currentSettings,
  widgetEnabled: initialWidgetEnabled,
  storageMode: initialStorageMode,
  enableArucoDetection: initialEnableArucoDetection,
  defaultModelId: initialDefaultModelId,
  rotationSpeed: initialRotationSpeed,
  backgroundColor: initialBackgroundColor,
  showModelName: initialShowModelName,
  models = [],
  onSave,
  currentPin,
  onGeneratePin,
  embedToken,
  onGenerateEmbed,
  embedCode
}: ViewerSettingsDialogProps) {
  const [open, setOpen] = useState(false);
  
  // Texture Cycling Settings
  const [enabled, setEnabled] = useState(currentSettings?.enabled ?? true);
  const [priorityTimeWindow, setPriorityTimeWindow] = useState(currentSettings?.priorityTimeWindow ?? 2);
  const [priorityRepeatCount, setPriorityRepeatCount] = useState(currentSettings?.priorityRepeatCount ?? 6);
  const [standardDisplayDuration, setStandardDisplayDuration] = useState(currentSettings?.standardDisplayDuration ?? 5);
  
  // Display Settings
  const [rotationSpeed, setRotationSpeed] = useState(initialRotationSpeed ?? 0.5);
  const [backgroundColor, setBackgroundColor] = useState(initialBackgroundColor ?? '#000000');
  const [showModelName, setShowModelName] = useState(initialShowModelName ?? true);
  
  // Widget Embedding Settings
  const [widgetEnabled, setWidgetEnabled] = useState(initialWidgetEnabled ?? false);
  const [storageMode, setStorageMode] = useState<'server' | 'local' | 'hybrid'>(initialStorageMode ?? 'hybrid');
  const [enableArucoDetection, setEnableArucoDetection] = useState(initialEnableArucoDetection ?? false);
  const [defaultModelId, setDefaultModelId] = useState<string>(initialDefaultModelId || (models[0]?.id ?? ''));
  const [copiedWidgetCode, setCopiedWidgetCode] = useState(false);
  
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);

  // Generate widget embed code
  const widgetBaseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const widgetCode = `<div data-claypixels-viewer="${viewerId}" style="width:100%;height:500px;"></div>
<script src="${widgetBaseUrl}/widget/widget.js"></script>`;

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess(false);

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
          textureCycling: settings,
          rotationSpeed,
          backgroundColor,
          showModelName,
          widgetEnabled,
          storageMode,
          enableArucoDetection,
          defaultModelId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      setSuccess(true);
      setTimeout(() => {
        setOpen(false);
        if (onSave) onSave();
      }, 1000);
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
          <Settings className="h-3 w-3 mr-2" />
          Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Viewer Settings</DialogTitle>
          <DialogDescription>
            Configure texture cycling and display behavior
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Texture Cycling Section */}
          <div className="space-y-4 p-4 border rounded-lg">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Texture Cycling Mode</h3>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="enabled"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="enabled" className="font-normal cursor-pointer text-sm">
                  Enabled
                </Label>
              </div>
            </div>

            {enabled && (
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="priorityTimeWindow" className="text-xs">
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
                    className="h-9"
                  />
                  <p className="text-xs text-gray-500">
                    Textures uploaded within this time are considered "recent"
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="priorityRepeatCount" className="text-xs">
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
                    className="h-9"
                  />
                  <p className="text-xs text-gray-500">
                    How many times to show recent textures before cycling all
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="standardDisplayDuration" className="text-xs">
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
                    className="h-9"
                  />
                  <p className="text-xs text-gray-500">
                    How long to display each texture
                  </p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                  <p className="text-xs text-blue-900">
                    <strong>How it works:</strong> Recent textures (uploaded within the time window) will be shown {priorityRepeatCount}x, 
                    then the display will cycle through all textures from all models.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Display Settings Section */}
          <div className="space-y-4 p-4 border rounded-lg">
            <h3 className="font-semibold text-sm">Display Settings</h3>
            
            <div className="space-y-2">
              <Label htmlFor="rotationSpeed" className="text-xs">
                Model Rotation Speed
              </Label>
              <Input
                id="rotationSpeed"
                type="number"
                min="0"
                max="3"
                step="0.1"
                value={rotationSpeed}
                onChange={(e) => setRotationSpeed(parseFloat(e.target.value))}
                className="h-9"
              />
              <p className="text-xs text-gray-500">
                How fast the 3D model rotates (0 = no rotation, 0.5 = default, 3 = fast)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="backgroundColor" className="text-xs">
                Background Color
              </Label>
              <div className="flex gap-2">
                <Input
                  id="backgroundColor"
                  type="color"
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="h-9 w-16 p-1 cursor-pointer"
                />
                <Input
                  type="text"
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  placeholder="#000000"
                  className="h-9 flex-1 font-mono"
                />
              </div>
              <p className="text-xs text-gray-500">
                Viewer background color (hex code)
              </p>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <input
                type="checkbox"
                id="showModelName"
                checked={showModelName}
                onChange={(e) => setShowModelName(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="showModelName" className="font-normal cursor-pointer text-sm">
                Show 3D model name
              </Label>
            </div>
            <p className="text-xs text-gray-500 -mt-2">
              Display the model name overlay in the viewer
            </p>
          </div>

          {/* PIN Management Section */}
          <div className="space-y-3 p-4 border rounded-lg">
            <h3 className="font-semibold text-sm">PIN Security</h3>
            <p className="text-xs text-gray-500">Manage viewer access PIN code</p>
            
            {currentPin && (
              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPin(!showPin)}
                  className="w-full"
                >
                  <Eye className="h-3 w-3 mr-2" />
                  {showPin ? 'Hide PIN' : 'Show PIN'}
                </Button>
                
                {showPin && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-center">
                    <p className="text-2xl font-mono font-bold tracking-widest text-blue-900">
                      {currentPin}
                    </p>
                  </div>
                )}
              </div>
            )}
            
            {onGeneratePin && (
              <Button
                variant="outline"
                size="sm"
                onClick={onGeneratePin}
                className="w-full"
              >
                <RefreshCw className="h-3 w-3 mr-2" />
                Generate New PIN
              </Button>
            )}
            
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-2">
              <p className="text-xs text-yellow-900">
                💡 Generate a new PIN if the current one has been compromised or you want to revoke access.
              </p>
            </div>
          </div>

          {/* Embed Code Section */}
          {onGenerateEmbed && (
            <div className="space-y-3 p-4 border rounded-lg">
              <h3 className="font-semibold text-sm">Embed Code</h3>
              <p className="text-xs text-gray-500">Generate code to embed viewer on any website</p>
              
              {!embedToken ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onGenerateEmbed}
                  className="w-full"
                >
                  <Code className="h-3 w-3 mr-2" />
                  Generate Embed Code
                </Button>
              ) : embedCode ? (
                <div className="space-y-2">
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
                    <code className="text-xs bg-white p-2 rounded block overflow-x-auto break-all">
                      {embedCode}
                    </code>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(embedCode);
                      setCopiedEmbed(true);
                      setTimeout(() => setCopiedEmbed(false), 2000);
                    }}
                    className="w-full"
                  >
                    {copiedEmbed ? (
                      <>
                        <Check className="h-3 w-3 mr-2" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3 mr-2" />
                        Copy Embed Code
                      </>
                    )}
                  </Button>
                </div>
              ) : null}
            </div>
          )}

          {/* Widget Embedding Section */}
          <div className="space-y-3 p-4 border rounded-lg border-purple-200 bg-purple-50/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-purple-600" />
                <h3 className="font-semibold text-sm">Widget Embedding</h3>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="widgetEnabled"
                  checked={widgetEnabled}
                  onChange={(e) => setWidgetEnabled(e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="widgetEnabled" className="font-normal cursor-pointer text-sm">
                  Enabled
                </Label>
              </div>
            </div>
            
            <p className="text-xs text-gray-500">
              Allow customers to embed a 3D viewer with upload capability on their own websites
            </p>

            {/* Default Model Selection - Always visible when models exist */}
            {models.length > 0 && (
              <div className="space-y-2 p-3 bg-orange-50 border border-orange-200 rounded-md">
                <Label htmlFor="defaultModelId" className="text-xs font-medium">
                  🎯 Default Model (when no textures uploaded)
                </Label>
                <select
                  id="defaultModelId"
                  value={defaultModelId}
                  onChange={(e) => setDefaultModelId(e.target.value)}
                  className="w-full h-9 px-3 text-sm border rounded-md bg-white"
                >
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-600">
                  This model will be shown by default until a texture is uploaded. Once textures are uploaded, only models with textures will be displayed.
                </p>
              </div>
            )}

            {widgetEnabled && (
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="storageMode" className="text-xs font-medium">
                    Texture Storage Mode
                  </Label>
                  <select
                    id="storageMode"
                    value={storageMode}
                    onChange={(e) => setStorageMode(e.target.value as 'server' | 'local' | 'hybrid')}
                    className="w-full h-9 px-3 text-sm border rounded-md bg-white"
                  >
                    <option value="hybrid">Hybrid (Local display + Cloud backup)</option>
                    <option value="local">Local Only (Browser storage only)</option>
                    <option value="server">Server Only (All textures to cloud)</option>
                  </select>
                  <p className="text-xs text-gray-500">
                    {storageMode === 'hybrid' && 'Processed textures display locally, originals saved to cloud'}
                    {storageMode === 'local' && 'All processing and storage happens in the browser'}
                    {storageMode === 'server' && 'All textures are uploaded and stored on the server'}
                  </p>
                </div>

                <div className="space-y-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <Label htmlFor="enableArucoDetection" className="text-xs font-medium cursor-pointer">
                        Smart ArUco Detection
                      </Label>
                      <p className="text-xs text-gray-600 mt-1">
                        Auto-detect which 3D model based on unique marker IDs. Hides model selector.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      id="enableArucoDetection"
                      checked={enableArucoDetection}
                      onChange={(e) => setEnableArucoDetection(e.target.checked)}
                      className="rounded ml-3 flex-shrink-0"
                    />
                  </div>
                  {enableArucoDetection ? (
                    <div className="bg-green-50 border border-green-200 rounded p-2 mt-2">
                      <p className="text-xs text-green-800">
                        ✓ <strong>Smart Mode:</strong> Widget auto-detects model from markers, no manual selection needed
                      </p>
                    </div>
                  ) : (
                    <div className="bg-gray-50 border border-gray-200 rounded p-2 mt-2">
                      <p className="text-xs text-gray-700">
                        <strong>Standard Mode:</strong> ArUco corrects perspective, user selects model manually
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium">Widget Embed Code</Label>
                  <div className="p-3 bg-white border border-gray-200 rounded-md">
                    <code className="text-xs block overflow-x-auto break-all whitespace-pre-wrap font-mono text-purple-700">
                      {widgetCode}
                    </code>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(widgetCode);
                      setCopiedWidgetCode(true);
                      setTimeout(() => setCopiedWidgetCode(false), 2000);
                    }}
                    className="w-full"
                  >
                    {copiedWidgetCode ? (
                      <>
                        <Check className="h-3 w-3 mr-2" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3 mr-2" />
                        Copy Widget Code
                      </>
                    )}
                  </Button>
                </div>

                <div className="bg-purple-100 border border-purple-200 rounded-md p-3">
                  <p className="text-xs text-purple-900">
                    <strong>How it works:</strong> Customers paste this code on their website. 
                    Visitors can upload photos that get processed client-side using ArUco markers{enableArucoDetection ? ' and automatically detect which model the texture belongs to' : ', then select the model manually'}. 
                    Processed textures are stored in the visitor's browser while originals are backed up to your cloud storage.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Display Info Section */}
          <div className="space-y-3 p-4 border rounded-lg bg-gray-50">
            <h3 className="font-semibold text-sm">Display Features</h3>
            <div className="text-xs space-y-2 text-gray-600">
              <div className="flex items-start gap-2">
                <span className="text-green-600">✓</span>
                <span>Author information displayed on bottom-left corner (name and age)</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-green-600">✓</span>
                <span>Custom logo displayed on bottom-right corner</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-green-600">✓</span>
                <span>IndexedDB caching for offline viewing and fast load times</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-green-600">✓</span>
                <span>3D model rotation and texture application</span>
              </div>
            </div>
          </div>

          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md border border-red-200">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 text-sm text-green-600 bg-green-50 rounded-md border border-green-200">
              Settings saved successfully!
            </div>
          )}

          <Button onClick={handleSave} className="w-full" disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
