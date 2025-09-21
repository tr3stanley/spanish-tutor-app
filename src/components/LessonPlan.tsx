'use client';

interface LessonPlanProps {
  lesson: {
    summary: string;
    grammar_rules: string;
    vocabulary: string;
  };
  language: string;
}

export default function LessonPlan({ lesson }: LessonPlanProps) {

  const formatContent = (content: string) => {
    // Simple formatting for better readability
    return content.split('\n').map((line, index) => (
      <p key={index} className="mb-2">
        {line}
      </p>
    ));
  };

  return (
    <div className="space-y-8">
      {/* Summary Section */}
      <section>
        <div className="flex items-center mb-4">
          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Summary</h2>
        </div>
        <div className="bg-blue-50 rounded-lg p-6">
          <div className="text-gray-800 leading-relaxed">
            {formatContent(lesson.summary)}
          </div>
        </div>
      </section>

      {/* Grammar Rules Section */}
      <section>
        <div className="flex items-center mb-4">
          <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center mr-3">
            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Grammar Rules</h2>
        </div>
        <div className="bg-green-50 rounded-lg p-6">
          <div className="text-gray-800 leading-relaxed">
            {formatContent(lesson.grammar_rules)}
          </div>
        </div>
      </section>

      {/* Vocabulary Section */}
      <section>
        <div className="flex items-center mb-4">
          <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center mr-3">
            <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Vocabulary</h2>
        </div>
        <div className="bg-purple-50 rounded-lg p-6">
          <div className="text-gray-800 leading-relaxed">
            {formatContent(lesson.vocabulary)}
          </div>
        </div>
      </section>

      {/* Study Tips */}
      <section className="bg-yellow-50 rounded-lg p-6 border-l-4 border-yellow-400">
        <div className="flex items-center mb-3">
          <svg className="w-5 h-5 text-yellow-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <h3 className="text-lg font-semibold text-yellow-800">Study Tips</h3>
        </div>
        <ul className="text-yellow-700 space-y-2">
          <li>• Listen to the podcast multiple times while reading along with the transcript</li>
          <li>• Practice the vocabulary words in your own sentences</li>
          <li>• Use the &quot;Explain&quot; feature when you encounter difficult segments</li>
          <li>• Try to identify the grammar patterns as they appear in the audio</li>
          <li>• Take notes on cultural references or expressions that are new to you</li>
        </ul>
      </section>
    </div>
  );
}