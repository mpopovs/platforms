# Queue Ticket System

A real-time queue management system for texture uploads without language barriers.

## ✅ **Correct Implementation**

The museum display at `/viewer/[viewerId]` shows:
- **3D models with uploaded textures** (main display)
- **Current queue number at the bottom** (e.g., #101)
- Real-time updates when new textures are uploaded

## 🎯 How It Works

### User Flow (Mobile)
1. **📸 Capture** - User takes photo with ArUco markers
2. **🔍 Preview** - System auto-crops and shows 3D preview 
3. **⬆️ Upload** - User confirms and uploads
4. **🎫 Queue Number** - System assigns queue number (e.g., #104)
5. **📍 Live Status** - Shows position in queue and estimated wait time

### Display Flow (Museum Screen)
1. **🖥️ Big Screen** - Museum display shows 3D model with texture
2. **🎫 Queue Number** - Current queue number displayed at bottom of screen
3. **🔄 Real-time** - Automatically updates when queue advances
4. **🎨 Integrated** - Queue display is part of the existing viewer at `/viewer/[viewerId]`

## 📁 Key Files

### Pages
- `/app/upload/[viewerId]/[modelId]/page.tsx` - Upload page
- `/app/viewer/[viewerId]/page.tsx` - Museum display (shows 3D models + queue number)

### Components
- `/app/upload/[viewerId]/[modelId]/upload-form.tsx` - Upload form with icon-only UI
- `/app/upload/[viewerId]/[modelId]/queue-status.tsx` - Real-time queue position
- `/app/viewer/[viewerId]/viewer-display.tsx` - Viewer with integrated queue display
- `/app/admin/queue/[viewerId]/queue-control.tsx` - Admin control panel for queue management

### API Routes
- `/app/api/queue/current/route.ts` - Get/advance current queue number
- `/app/api/queue/position/route.ts` - Get position for specific queue number
- `/app/api/upload-texture/route.ts` - Upload texture and create queue entry

### Database
- `/supabase/migrations/20250129000000_create_texture_queue.sql` - Queue table

## 🗄️ Database Schema

```sql
texture_queue:
  - id (uuid)
  - queue_number (integer, unique)
  - texture_id (uuid, references textures)
  - viewer_id (uuid)
  - status ('waiting' | 'displaying' | 'completed')
  - created_at (timestamp)
  - displayed_at (timestamp)
  - completed_at (timestamp)
```

## 🌐 Real-time Updates

Uses Supabase Realtime for instant queue updates:
- Mobile app listens for queue status changes
- Display screen listens for new entries/advances
- No polling required (with 5-10s backup polling)

## 🎨 Icon-Only Interface

No text labels - universal visual language:
- 👤 Name input
- 🎂 Age input  
- 📸 Camera/upload
- ✂️ Cropped texture
- 🎫 Queue ticket
- 📍 Position in line
- ⏱️ Wait time
- ⬆️ Upload button
- 👁️ Preview button

## 🚀 Usage

### Upload Page
```
/upload/{viewerId}/{modelId}
```

### Museum Display (Shows 3D Models + Queue Number)
```
/viewer/{viewerId}
```
The viewer displays:
- 3D models with uploaded textures (rotating carousel)
- Current queue number at the bottom of the screen
- Real-time updates via Supabase Realtime

### Admin Queue Control (Optional)
```
/admin/queue/{viewerId}
```
Staff dashboard to:
- View current queue status
- Manually advance to next in queue
- Jump to specific queue number
- View completed entries

## ⚙️ Configuration

Queue timing can be managed through the queue API:
```typescript
// Advance queue manually via API
POST /api/queue/current
{ "viewerId": "xxx" }

// Or create an admin control page to manage queue progression
```

Estimated wait per person in queue-status.tsx:
```typescript
const wait = (position - 1) * 60; // 60 seconds each
```
