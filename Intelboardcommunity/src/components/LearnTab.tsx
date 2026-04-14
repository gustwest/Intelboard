'use client';

import React, { useState } from 'react';
import { useAuth, DEMO_USERS, getDemoAvatar } from '@/contexts/AuthContext';
import styles from './LearnTab.module.css';

interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface Quiz {
  id: string;
  title: string;
  questions: QuizQuestion[];
}

export default function LearnTab({ categoryId, categoryName, wikiContent }: { categoryId: string; categoryName: string; wikiContent: string }) {
  const { user, signInAsDemo } = useAuth();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Builder state
  const [builderTitle, setBuilderTitle] = useState('');
  const [builderQuestions, setBuilderQuestions] = useState<QuizQuestion[]>([{
    question: '', options: ['', '', '', ''], correctIndex: 0, explanation: ''
  }]);

  function generateAIQuiz() {
    setGenerating(true);
    // Simulate AI quiz generation based on category content
    setTimeout(() => {
      const quiz: Quiz = {
        id: Date.now().toString(),
        title: `${categoryName} Knowledge Check`,
        questions: [
          {
            question: `Which of the following best describes ${categoryName}?`,
            options: [
              wikiContent.slice(0, 60) + '...',
              'An unrelated concept from a different field',
              'A recently invented modern discipline',
              'None of the above apply',
            ],
            correctIndex: 0,
            explanation: `${categoryName} is described as: ${wikiContent.slice(0, 120)}...`
          },
          {
            question: `${categoryName} is commonly associated with which area of knowledge?`,
            options: [
              'Sports and Recreation exclusively',
              'Multiple domains of human knowledge',
              'Only modern technology',
              'Exclusively ancient history',
            ],
            correctIndex: 1,
            explanation: `${categoryName} spans multiple domains and is relevant across various areas of study.`
          },
          {
            question: `What is a key characteristic of study within ${categoryName}?`,
            options: [
              'It requires no prior knowledge',
              'It is exclusively theoretical with no applications',
              'It involves systematic inquiry and understanding',
              'It has remained unchanged throughout history',
            ],
            correctIndex: 2,
            explanation: `Studying ${categoryName} involves systematic inquiry, building on existing knowledge to deepen understanding.`
          },
          {
            question: `How does ${categoryName} contribute to broader understanding?`,
            options: [
              'It has no practical applications',
              'It provides foundational knowledge that connects to other fields',
              'It only matters to specialists',
              'Its relevance is limited to academic settings',
            ],
            correctIndex: 1,
            explanation: `${categoryName} provides foundational knowledge that often connects to and informs other fields of study.`
          },
          {
            question: `Which approach is most effective for learning about ${categoryName}?`,
            options: [
              'Memorizing facts without context',
              'Ignoring historical development',
              'Engaging with diverse sources and community discussions',
              'Studying in complete isolation',
            ],
            correctIndex: 2,
            explanation: `Engaging with diverse sources, participating in community discussions, and relating concepts to real-world examples leads to deeper understanding.`
          },
        ]
      };
      setQuizzes([quiz, ...quizzes]);
      setGenerating(false);
    }, 2000);
  }

  function startQuiz(quiz: Quiz) {
    setActiveQuiz(quiz);
    setCurrentQ(0);
    setAnswers(new Array(quiz.questions.length).fill(null));
    setShowResults(false);
  }

  function selectAnswer(index: number) {
    const newAnswers = [...answers];
    newAnswers[currentQ] = index;
    setAnswers(newAnswers);
  }

  function nextQuestion() {
    if (currentQ < (activeQuiz?.questions.length || 0) - 1) {
      setCurrentQ(currentQ + 1);
    } else {
      setShowResults(true);
    }
  }

  function addBuilderQuestion() {
    setBuilderQuestions([...builderQuestions, { question: '', options: ['', '', '', ''], correctIndex: 0, explanation: '' }]);
  }

  function updateBuilderQuestion(idx: number, field: 'question' | 'explanation' | 'correctIndex', value: string | number) {
    const updated = [...builderQuestions];
    if (field === 'question') {
      updated[idx] = { ...updated[idx], question: value as string };
    } else if (field === 'explanation') {
      updated[idx] = { ...updated[idx], explanation: value as string };
    } else if (field === 'correctIndex') {
      updated[idx] = { ...updated[idx], correctIndex: value as number };
    }
    setBuilderQuestions(updated);
  }

  function updateBuilderOption(qIdx: number, optIdx: number, value: string) {
    const updated = [...builderQuestions];
    updated[qIdx].options[optIdx] = value;
    setBuilderQuestions(updated);
  }

  function saveBuilderQuiz() {
    if (!builderTitle.trim() || builderQuestions.some(q => !q.question.trim())) return;
    const quiz: Quiz = {
      id: Date.now().toString(),
      title: builderTitle,
      questions: builderQuestions,
    };
    setQuizzes([quiz, ...quizzes]);
    setShowBuilder(false);
    setBuilderTitle('');
    setBuilderQuestions([{ question: '', options: ['', '', '', ''], correctIndex: 0, explanation: '' }]);
  }

  // Taking a quiz
  if (activeQuiz) {
    const q = activeQuiz.questions[currentQ];
    const score = answers.filter((a, i) => a === activeQuiz.questions[i].correctIndex).length;

    if (showResults) {
      return (
        <div className={styles.container}>
          <div className={styles.resultsCard}>
            <div className={styles.resultsIcon}>🎉</div>
            <h2 className={styles.resultsTitle}>Quiz Complete!</h2>
            <div className={styles.scoreCircle}>
              <span className={styles.scoreNum}>{score}</span>
              <span className={styles.scoreTotal}>/ {activeQuiz.questions.length}</span>
            </div>
            <p className={styles.scoreLabel}>
              {score === activeQuiz.questions.length ? 'Perfect score! 🌟' :
               score >= activeQuiz.questions.length * 0.7 ? 'Great job! 👏' :
               score >= activeQuiz.questions.length * 0.5 ? 'Good effort! 💪' : 'Keep learning! 📚'}
            </p>

            <div className={styles.reviewList}>
              {activeQuiz.questions.map((qq, i) => (
                <div key={i} className={`${styles.reviewItem} ${answers[i] === qq.correctIndex ? styles.correct : styles.incorrect}`}>
                  <div className={styles.reviewHeader}>
                    <span className={styles.reviewStatus}>{answers[i] === qq.correctIndex ? '✅' : '❌'}</span>
                    <span className={styles.reviewQuestion}>{qq.question}</span>
                  </div>
                  <p className={styles.reviewExplanation}>{qq.explanation}</p>
                </div>
              ))}
            </div>

            <div className={styles.resultsActions}>
              <button className="btn-secondary" onClick={() => setActiveQuiz(null)}>Back to Quizzes</button>
              <button className="btn-primary" onClick={() => startQuiz(activeQuiz)}>Retry</button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className={styles.container}>
        <button className="btn-ghost" onClick={() => setActiveQuiz(null)} style={{ marginBottom: '1rem' }}>
          ← Back to quizzes
        </button>
        <div className={styles.quizCard}>
          <div className={styles.quizProgress}>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${((currentQ + 1) / activeQuiz.questions.length) * 100}%` }}></div>
            </div>
            <span className={styles.progressText}>Question {currentQ + 1} of {activeQuiz.questions.length}</span>
          </div>

          <h3 className={styles.questionText}>{q.question}</h3>

          <div className={styles.optionsList}>
            {q.options.map((opt, i) => (
              <button
                key={i}
                className={`${styles.optionBtn} ${answers[currentQ] === i ? styles.optionSelected : ''}`}
                onClick={() => selectAnswer(i)}
              >
                <span className={styles.optionLetter}>{String.fromCharCode(65 + i)}</span>
                <span className={styles.optionText}>{opt}</span>
              </button>
            ))}
          </div>

          <div className={styles.quizActions}>
            {currentQ > 0 && (
              <button className="btn-secondary" onClick={() => setCurrentQ(currentQ - 1)}>Previous</button>
            )}
            <button
              className="btn-primary"
              onClick={nextQuestion}
              disabled={answers[currentQ] === null}
            >
              {currentQ === activeQuiz.questions.length - 1 ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Builder view
  if (showBuilder) {
    return (
      <div className={styles.container}>
        <button className="btn-ghost" onClick={() => setShowBuilder(false)} style={{ marginBottom: '1rem' }}>
          ← Back
        </button>
        <h2 style={{ marginBottom: '1.5rem' }}>Create Quiz</h2>
        <input className="input" placeholder="Quiz title" value={builderTitle} onChange={(e) => setBuilderTitle(e.target.value)} style={{ marginBottom: '1.5rem' }} />

        {builderQuestions.map((q, qIdx) => (
          <div key={qIdx} className={styles.builderQuestion}>
            <h4 className={styles.builderQNum}>Question {qIdx + 1}</h4>
            <input className="input" placeholder="Enter question..." value={q.question} onChange={(e) => updateBuilderQuestion(qIdx, 'question', e.target.value)} />
            <div className={styles.builderOptions}>
              {q.options.map((opt, optIdx) => (
                <div key={optIdx} className={styles.builderOptionRow}>
                  <input
                    type="radio"
                    name={`correct-${qIdx}`}
                    checked={q.correctIndex === optIdx}
                    onChange={() => updateBuilderQuestion(qIdx, 'correctIndex', optIdx)}
                  />
                  <input className="input" placeholder={`Option ${String.fromCharCode(65 + optIdx)}`} value={opt} onChange={(e) => updateBuilderOption(qIdx, optIdx, e.target.value)} />
                </div>
              ))}
            </div>
            <input className="input" placeholder="Explanation (shown after answering)" value={q.explanation} onChange={(e) => updateBuilderQuestion(qIdx, 'explanation', e.target.value)} />
          </div>
        ))}

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
          <button className="btn-secondary" onClick={addBuilderQuestion}>+ Add Question</button>
          <button className="btn-primary" onClick={saveBuilderQuiz}>Save Quiz</button>
        </div>
      </div>
    );
  }

  // Main quiz list
  return (
    <div className={styles.container}>
      <div className={styles.learnHeader}>
        <h2 className={styles.learnTitle}>🧠 Learning & Quizzes</h2>
        <div className={styles.learnActions}>
          <button className="btn-secondary" onClick={() => user ? setShowBuilder(true) : signInAsDemo(DEMO_USERS[0].uid)}>
            📝 Create Quiz
          </button>
          <button className="btn-primary" onClick={generateAIQuiz} disabled={generating}>
            {generating ? (
              <><span className={styles.spinner}></span> Generating...</>
            ) : (
              <>🤖 AI Generate Quiz</>
            )}
          </button>
        </div>
      </div>

      {quizzes.length > 0 ? (
        <div className={styles.quizList}>
          {quizzes.map(quiz => (
            <div key={quiz.id} className={`${styles.quizListCard} glass-card`}>
              <div className={styles.quizListInfo}>
                <h3>{quiz.title}</h3>
                <span className={styles.quizListMeta}>{quiz.questions.length} questions</span>
              </div>
              <button className="btn-primary" onClick={() => startQuiz(quiz)}>Start Quiz</button>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">🧠</div>
          <div className="empty-state-title">No quizzes yet</div>
          <div className="empty-state-desc">Create your own quiz or let AI generate one from this category&apos;s content.</div>
        </div>
      )}
    </div>
  );
}
