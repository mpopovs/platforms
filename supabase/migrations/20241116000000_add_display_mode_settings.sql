-- Add display mode settings to viewer settings
-- This extends the existing settings jsonb column

-- Example of what the settings will look like:
COMMENT ON COLUMN viewers.settings IS 'JSONB settings including:
{
  "displayTitle": "string",
  "displayMessage": "string",
  "backgroundColor": "string",
  "textColor": "string",
  "customContent": "string",
  "rotationSpeed": 0.5,
  "modelDisplayDuration": 20,
  "displayModes": {
    "standardMode": {
      "duration": 5,
      "rotationSpeed": 0.5,
      "enabled": true
    },
    "newUploadMode": {
      "duration": 8,
      "highlightEffect": "glow",
      "soundAlert": false,
      "enabled": true
    },
    "showcaseMode": {
      "enabled": true,
      "frequency": 18,
      "duration": 60,
      "textureInterval": 1.5
    },
    "detailedMode": {
      "duration": 8,
      "featuredModels": []
    },
    "interactionSettings": {
      "pauseOnTouch": true,
      "manualNavigation": true,
      "autoResumeAfter": 15
    }
  }
}';
