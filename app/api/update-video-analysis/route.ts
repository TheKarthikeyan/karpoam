import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withSecurity, SECURITY_PRESETS } from '@/lib/security-middleware';

interface UpdateResult {
  success: boolean;
  video_id: string | null;
}

async function handler(req: NextRequest) {
  try {
    const {
      videoId,
      summary,
      suggestedQuestions
    } = await req.json();

    if (!videoId) {
      return NextResponse.json(
        { error: 'Video ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // KARPOAM: Allow unauthenticated updates for personal use
    const DISABLE_RATE_LIMITS = process.env.DISABLE_RATE_LIMITS === 'true';

    // Get authenticated user
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (!DISABLE_RATE_LIMITS && (authError || !user)) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Build update object
    const updateData: Record<string, any> = {};
    if (summary !== undefined) updateData.summary = summary;
    if (suggestedQuestions !== undefined) updateData.suggested_questions = suggestedQuestions;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({
        success: true,
        videoId
      });
    }

    // For personal use without auth, use direct update
    if (DISABLE_RATE_LIMITS && !user) {
      const { error: updateError } = await supabase
        .from('video_analyses')
        .update(updateData)
        .eq('youtube_id', videoId);

      if (updateError) {
        console.error('Error updating video analysis:', updateError);
        return NextResponse.json(
          { error: 'Failed to update video analysis' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        videoId
      });
    }

    // Use secure update function with ownership verification
    const { data: result, error: updateError } = await supabase
      .rpc('update_video_analysis_secure', {
        p_youtube_id: videoId,
        p_user_id: user!.id,
        p_summary: summary ?? null,
        p_suggested_questions: suggestedQuestions ?? null
      })
      .single<UpdateResult>();

    if (updateError) {
      console.error('Error updating video analysis:', updateError);
      return NextResponse.json(
        { error: 'Failed to update video analysis' },
        { status: 500 }
      );
    }

    // Check if update was authorized
    if (!result?.success) {
      return NextResponse.json(
        { error: 'Not authorized to update this video analysis' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      videoId: result.video_id
    });

  } catch (error) {
    console.error('Error in update video analysis:', error);
    return NextResponse.json(
      { error: 'Failed to process update request' },
      { status: 500 }
    );
  }
}

// KARPOAM: Use PUBLIC preset to allow unauthenticated updates when DISABLE_RATE_LIMITS=true
// Auth check is handled inside the handler
export const POST = withSecurity(handler, SECURITY_PRESETS.PUBLIC);
