import { NextResponse } from 'next/server';
import { getDatabase } from '@/lib/database';

export async function POST() {
  try {
    const db = await getDatabase();

    // Get the lesson data
    const lesson = await db.get('SELECT * FROM lessons WHERE podcast_id = ?', [7]);

    if (!lesson) {
      return NextResponse.json({ error: 'No lesson found for podcast 7' }, { status: 404 });
    }

    // Extract JSON from the summary field
    let summary = lesson.summary;

    // Remove markdown code blocks if present
    summary = summary.replace(/```json\n/g, '').replace(/\n```/g, '').replace(/```/g, '');

    try {
      const parsed = JSON.parse(summary);

      // Convert the structured data to formatted strings
      let grammarRules = '';
      if (parsed.grammarRules && Array.isArray(parsed.grammarRules)) {
        grammarRules = parsed.grammarRules.map((rule: any) => {
          let formatted = `**${rule.concept}**\n`;
          if (rule.examples) {
            formatted += `Examples: ${rule.examples.join(', ')}\n`;
          }
          if (rule.explanation) {
            formatted += `Explanation: ${rule.explanation}\n`;
          }
          if (rule.context) {
            formatted += `Context: ${rule.context}\n`;
          }
          return formatted;
        }).join('\n\n');
      }

      let vocabulary = '';
      if (parsed.vocabulary && Array.isArray(parsed.vocabulary)) {
        vocabulary = parsed.vocabulary.map((word: any) => {
          let formatted = `**${word.word}** (${word.partOfSpeech}) - ${word.translation}\n`;
          if (word.example) {
            formatted += `Example: ${word.example}\n`;
          }
          if (word.alternativeMeanings) {
            formatted += `Alternative meanings: ${word.alternativeMeanings}\n`;
          }
          return formatted;
        }).join('\n\n');
      }

      // Update the database
      await db.run(`
        UPDATE lessons
        SET summary = ?, grammar_rules = ?, vocabulary = ?
        WHERE podcast_id = ?
      `, [parsed.summary || summary, grammarRules, vocabulary, 7]);

      return NextResponse.json({
        success: true,
        message: 'Successfully updated lesson data for podcast 7',
        grammarRulesLength: grammarRules.length,
        vocabularyLength: vocabulary.length
      });

    } catch (parseError) {
      return NextResponse.json({
        error: 'Error parsing JSON',
        details: parseError,
        rawSummary: summary.substring(0, 500)
      }, { status: 400 });
    }

  } catch (error) {
    console.error('Error fixing lesson:', error);
    return NextResponse.json(
      { error: 'Failed to fix lesson data' },
      { status: 500 }
    );
  }
}