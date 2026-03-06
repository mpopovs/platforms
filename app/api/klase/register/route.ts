import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { generateViewerId, generatePin } from '@/lib/types/viewer';
import { saveViewerConfig, getViewerConfig, getViewerModels } from '@/lib/viewers';
import { generateShortCode } from '@/lib/short-links';
import { generateQRCodeImage, generateWorksheetPageContent, generateWorksheetFromLayout, generateKlaseInstructionPageContent, wrapWorksheetPages } from '@/lib/qr-codes';
import { protocol, rootDomain } from '@/lib/utils';

/** Service role client — bypasses RLS for public classroom registration */
function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { school_name, teacher_name, teacher_email, child_count, parent_viewer_id, mode, lang } = body;
    const uploadMode: 'standard' | 'autodetect' = mode === 'standard' ? 'standard' : 'autodetect';
    const worksheetLang: string = lang || 'en';

    if (!school_name?.trim() || !parent_viewer_id) {
      return NextResponse.json(
        { error: 'School name and museum viewer are required' },
        { status: 400 }
      );
    }

    const supabase = serviceClient();

    // Validate parent viewer exists, is not itself a child, and has classrooms enabled
    const parentConfig = await getViewerConfig(parent_viewer_id, supabase);
    if (!parentConfig) {
      return NextResponse.json({ error: 'Museum viewer not found' }, { status: 404 });
    }
    if (parentConfig.parentViewerId) {
      return NextResponse.json({ error: 'Cannot nest classroom viewers' }, { status: 400 });
    }
    if (!parentConfig.settings?.classroomEnabled) {
      return NextResponse.json({ error: 'Classroom viewers are not enabled for this display' }, { status: 403 });
    }

    // Generate classroom viewer credentials
    const classroomId = generateViewerId();
    const plainPin = generatePin();
    const hashedPin = await bcrypt.hash(plainPin, 10);
    const shortCode = generateShortCode();
    const classroomName = `${school_name.trim()} – Klase`;

    // Create classroom viewer (inherits parent settings, adds parent_viewer_id)
    await saveViewerConfig(
      {
        id: classroomId,
        userId: parentConfig.userId,
        name: classroomName,
        pin: hashedPin,
        shortCode,
        logo_url: parentConfig.logo_url ?? null,
        parentViewerId: parent_viewer_id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        settings: {
          ...parentConfig.settings,
          displayTitle: classroomName,
          displayMessage: '',
        },
      },
      supabase
    );

    // Record the registration
    await supabase.from('classroom_registrations').insert({
      school_name: school_name.trim(),
      teacher_name: teacher_name?.trim() || null,
      teacher_email: teacher_email?.trim() || null,
      child_count: Math.max(1, parseInt(child_count) || 1),
      viewer_id: classroomId,
      parent_viewer_id,
    });

    // Fetch parent viewer's models to generate worksheets
    const models = await getViewerModels(parent_viewer_id, supabase);
    const customLayout = parentConfig.settings?.worksheetLayout;

    // Generate one worksheet page per model
    const baseUrl = `${protocol}://${rootDomain}`;
    const viewerLink = `${baseUrl}/v/${shortCode}`;
    // Short display URL shown as text next to QR — human-typeable, redirects to /upload/[classroomId]
    const displayUrl = `${baseUrl}/c/${shortCode}`;
    const pageContents: string[] = [];

    for (const model of models) {
      let uploadUrl: string;
      let markerIdBase: number;

      if (uploadMode === 'autodetect') {
        // All worksheets share one viewer-level URL; ArUco markers identify the model
        uploadUrl = `${baseUrl}/upload/${classroomId}`;
        // Use the model's stored marker_id_base, falling back to order_index * 4
        markerIdBase = model.marker_id_base ?? (model.order_index * 4);
      } else {
        // Standard mode: each worksheet has its own QR code pointing to that model
        uploadUrl = `${baseUrl}/upload/${classroomId}/${model.id}`;
        // All worksheets use markers 0-3 (QR code already identifies the model)
        markerIdBase = 0;
      }

      const qrDataUrl = await generateQRCodeImage(uploadUrl);

      if (customLayout) {
        // Use the worksheet builder's saved layout (innerOnly=true so it embeds into wrapWorksheetPages)
        pageContents.push(
          generateWorksheetFromLayout(
            customLayout,
            qrDataUrl,
            model.uv_map_url ?? null,
            model.name,
            classroomName,
            uploadUrl,
            markerIdBase,
            worksheetLang,
            model.id,
            true, // innerOnly — return bare ws-page div
            displayUrl,
          )
        );
      } else {
        pageContents.push(
          generateWorksheetPageContent(
            qrDataUrl,
            model.name,
            classroomName,
            model.uv_map_url ?? null,
            uploadUrl,
            markerIdBase,
            worksheetLang,
            displayUrl,
          )
        );
      }
    }

    // Optionally prepend an instruction page if configured in the viewer's worksheet layout
    const instrConfig = parentConfig.settings?.worksheetLayout?.klaseInstructionPage;
    if (instrConfig?.enabled) {
      const klaseUrl = `${baseUrl}/klase`;
      const customText = instrConfig.customText?.[worksheetLang] ?? instrConfig.customText?.['lv'] ?? instrConfig.customText?.['en'];
      const instrPageContent = await generateKlaseInstructionPageContent(
        klaseUrl,
        plainPin,
        instrConfig.observerSurveyUrl || undefined,
        worksheetLang,
        customText,
        instrConfig.translations,
        {
          orientation:       instrConfig.orientation,
          viewerUrl:         viewerLink,
          showHeader:        instrConfig.showHeader  ?? true,
          showKlase:         instrConfig.showKlase   ?? true,
          showPin:           instrConfig.showPin     ?? true,
          showObserver:      instrConfig.showObserver ?? true,
          showKlaseUrlInPin: instrConfig.showKlaseUrlInPin ?? true,
          klaseUrlQrSizeMm:  instrConfig.klaseUrlQrSizeMm,
          klaseUrlTextSizePt: instrConfig.klaseUrlTextSizePt,
          sectionOrder:      instrConfig.sectionOrder,
          bodyItemOrder:     instrConfig.bodyItemOrder,
          bodyRows:          instrConfig.bodyRows as Array<{id:string;items:string[]}> | undefined,
          sectionStyles:     instrConfig.sectionStyles,
          extraBlocks:       instrConfig.extraBlocks,
          teacherSurvey:     instrConfig.teacherSurvey as { enabled?: boolean; title?: Record<string,string>; questions?: Array<{id:string;type:'open'|'checkbox'|'textarea'|'likert';text:Record<string,string>;options?: Array<Record<string,string>>}> } | undefined,
          teacherSurveyUrl:  instrConfig.teacherSurvey?.enabled ? `${baseUrl}/ts/${shortCode}?lang=${worksheetLang}` : undefined,
        },
      );
      pageContents.unshift(instrPageContent);
    }

    const worksheetHtml = wrapWorksheetPages(pageContents.join('\n'));

    return NextResponse.json({
      success: true,
      viewerLink,
      pin: plainPin,
      shortCode,
      classroomName,
      modelCount: models.length,
      worksheetHtml,
      mode: uploadMode,
    });
  } catch (error: any) {
    console.error('[klase/register] error:', error);
    return NextResponse.json(
      { error: 'Registration failed', details: error.message },
      { status: 500 }
    );
  }
}
