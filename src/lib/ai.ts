interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export async function callOpenRouter(
  prompt: string,
  model: string = 'deepseek/deepseek-chat'
): Promise<string> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'Spanish/Russian Podcast Tutor'
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 2000
    })
  });

  if (!response.ok) {
    throw new Error(`OpenRouter API error: ${response.statusText}`);
  }

  const data: OpenRouterResponse = await response.json();
  return data.choices[0]?.message?.content || '';
}

export async function generateLessonPlan(
  transcript: string,
  language: 'spanish' | 'russian'
): Promise<{
  summary: string;
  grammarRules: string;
  vocabulary: string;
}> {
  const languageName = language === 'spanish' ? 'Spanish' : 'Russian';

  const prompt = `
You are an expert ${languageName} language teacher. Analyze this podcast transcript and create a comprehensive lesson plan.

TRANSCRIPT:
${transcript}

CRITICAL: DO NOT return JSON. Return PLAIN TEXT ONLY in this EXACT format:

---SUMMARY---
A clear, engaging summary of what the podcast covers in 2-3 paragraphs

---GRAMMAR---
A comprehensive formatted text explanation of 5-8 key grammar concepts from the podcast. For each rule, provide a descriptive title, clear explanation of when and why it's used, concrete examples from the transcript, and practical usage tips. Include English translations for ALL ${languageName} phrases and examples used in explanations.

---VOCABULARY---
A formatted text list of 15-20 vocabulary words from the podcast. Format each word with the ${languageName} word, English translation, part of speech, example sentence from the transcript with English translation, and usage notes. Include English translations for ALL ${languageName} phrases used in explanations.

DO NOT use JSON format. DO NOT put this inside code blocks. Return ONLY plain text with the section markers.

For grammarRules, format like:
DESCRIPTIVE RULE TITLE (e.g., "Subjunctive Mood for Expressing Doubt")\\n
Examples: ejemplo en ${languageName} (example in English), otro ejemplo (another example)\\n
Explanation: Clear explanation of when and why this rule is used, with any ${languageName} phrases translated to English\\n
Context: How it's commonly used in conversation and practical application tips\\n\\n

For vocabulary, format like:
PALABRA (part of speech) - English translation\\n
Example: "Sentence from transcript in ${languageName}" (English translation of the sentence)\\n
Usage notes: Additional context, alternative meanings, or common collocations\\n
Alternative meanings: if any\\n\\n

CRITICAL JSON FORMATTING RULES:
- grammarRules and vocabulary MUST be valid JSON strings with proper escaping
- Do NOT include unescaped quotes or newlines inside JSON string values
- Use \\n for line breaks and \\" for quotes inside JSON strings
- NO markdown asterisks (**) inside JSON string values - use plain text instead
- The entire response must be valid, parseable JSON

Make this educational and engaging for an intermediate ${languageName} learner.
`;

  const response = await callOpenRouter(prompt);

  try {
    // Parse the response using section markers
    const summaryMatch = response.match(/---SUMMARY---([\s\S]*?)---GRAMMAR---/);
    const grammarMatch = response.match(/---GRAMMAR---([\s\S]*?)---VOCABULARY---/);
    const vocabularyMatch = response.match(/---VOCABULARY---([\s\S]*?)$/);

    return {
      summary: summaryMatch ? summaryMatch[1].trim() : response,
      grammarRules: grammarMatch ? grammarMatch[1].trim() : '',
      vocabulary: vocabularyMatch ? vocabularyMatch[1].trim() : ''
    };
  } catch (error) {
    console.error('Response parsing error:', error);
    console.log('Raw response:', response.substring(0, 500));

    // If parsing fails, return raw text
    return {
      summary: response,
      grammarRules: '',
      vocabulary: ''
    };
  }
}

export async function explainSegment(
  segmentText: string,
  language: 'spanish' | 'russian',
  context?: string
): Promise<string> {
  const languageName = language === 'spanish' ? 'Spanish' : 'Russian';

  const prompt = `
You are an expert ${languageName} language teacher. A student is listening to a podcast and doesn't understand this specific segment. Provide a clear, helpful explanation.

SEGMENT TO EXPLAIN:
"${segmentText}"

${context ? `CONTEXT FROM SURROUNDING TRANSCRIPT:\n${context}` : ''}

Please provide your explanation in this format:

**Original Segment:**
"${segmentText}"

**Full English Translation:**
[Provide a natural English translation of the entire segment]

**Detailed Breakdown:**

1. **Vocabulary Analysis:** Word-by-word breakdown of any difficult vocabulary (with English translations)
2. **Grammar Structures:** Explanation of grammar structures used (with English translations for any ${languageName} examples)
3. **Cultural Context:** Cultural context if relevant
4. **Learning Tips:** Tips for understanding similar phrases in the future

IMPORTANT: Always provide English translations immediately after any ${languageName} text in parentheses.
Make this explanation clear and educational for an intermediate ${languageName} learner. Be encouraging and supportive.
`;

  return await callOpenRouter(prompt);
}

export async function extractKeyPhrases(
  transcript: string,
  language: 'spanish' | 'russian'
): Promise<string[]> {
  const languageName = language === 'spanish' ? 'Spanish' : 'Russian';

  const prompt = `
Extract the 10-15 most important and useful phrases from this ${languageName} podcast transcript. Focus on:
- Common expressions
- Idiomatic phrases
- Useful conversational phrases
- Cultural expressions

TRANSCRIPT:
${transcript}

Return only the ${languageName} phrases, one per line, without translations or explanations.
`;

  const response = await callOpenRouter(prompt);
  return response.split('\n').filter(line => line.trim().length > 0);
}