
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { CATEGORY_GROUPS, ALL_CATEGORIES } from './constants';
import { GameStatus, Question, UserAnswer } from './types';

const AppHeader: React.FC = () => (
  <header className="flex items-center justify-center p-4 bg-sky-800 text-white shadow-md w-full flex-shrink-0">
    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" viewBox="0 0 100 100" fill="currentColor">
      <path d="M50 8C26.8 8 8 26.8 8 50s18.8 42 42 42 42-18.8 42-42S73.2 8 50 8zm0 76c-18.8 0-34-15.2-34-34S31.2 16 50 16s34 15.2 34 34-15.2 34-34 34z" />
      <path d="M50 35.8c-2.4-5.2-7-8.8-12.6-8.8s-10.2 3.6-12.6 8.8L21.3 43l-6.7 3.4 4 7.9 6.7-3.4 3.2 7.1-7.2 6.9 8 4 7.2-7.1 3.3 6.7h8l3.3-6.7 7.2 7.1 8-4-7.2-6.9 3.2-7.1 6.7 3.4 4-7.9-6.7-3.4-3.5-7.2zM37.4 56.4c-2.2 0-4-1.8-4-4s1.8-4 4-4 4 1.8 4 4-1.8 4-4 4zm25.2 0c-2.2 0-4-1.8-4-4s1.8-4 4-4 4 1.8 4 4-1.8 4-4 4z" />
      <path d="M50 22c-1.1 0-2 .9-2 2v6c0 1.1.9 2 2 2s2-.9 2-2v-6c0-1.1-.9-2-2-2zM28.2 28.2c-.8-.8-2-.8-2.8 0s-.8 2 0 2.8l4.2 4.2c.8.8 2 .8 2.8 0s.8-2 0-2.8l-4.2-4.2zM71.8 28.2c-.8-.8-2-.8-2.8 0l-4.2 4.2c-.8.8-.8 2 0 2.8s2 .8 2.8 0l4.2-4.2c.8-.8.8-2 0-2.8zM16 50c0-1.1.9-2 2-2h6c1.1 0 2 .9 2 2s-.9 2-2 2h-6c-1.1 0-2-.9-2-2zm60 0c0-1.1.9-2 2-2h6c1.1 0 2 .9 2 2s-.9 2-2 2h-6c-1.1 0-2-.9-2-2zM28.2 71.8c-.8.8-2 .8-2.8 0l-4.2-4.2c-.8-.8-.8-2 0-2.8s2-.8 2.8 0l4.2 4.2c.8.8.8 2 0 2.8zM71.8 71.8c-.8-.8-2-.8-2.8 0s-.8 2 0 2.8l4.2 4.2c.8.8 2 .8 2.8 0s.8-2 0-2.8l-4.2-4.2zM50 78c-1.1 0-2 .9-2 2v6c0 1.1.9 2 2 2s2-.9 2-2v-6c0-1.1-.9-2-2-2z" />
      <path d="M50 42c-8.8 0-16 7.2-16 16h32c0-8.8-7.2-16-16-16z M50 54c-2.2 0-4-1.8-4-4s1.8-4 4-4 4 1.8 4 4-1.8 4-4 4z"/>
    </svg>
    <h1 className="text-3xl font-bold ml-4 tracking-wider">Scout Trivia</h1>
  </header>
);


const App: React.FC = () => {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [gameStatus, setGameStatus] = useState<GameStatus>(GameStatus.SELECTING);
  const [questionsByCategory, setQuestionsByCategory] = useState<Record<string, Question[]>>({});
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [currentCategoryQuestionIndex, setCurrentCategoryQuestionIndex] = useState(0);
  const [completedCategories, setCompletedCategories] = useState<Set<string>>(new Set());
  const [userAnswers, setUserAnswers] = useState<UserAnswer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [recentlyAsked, setRecentlyAsked] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<{ message: string; isCorrect: boolean } | null>(null);
  const [isMeritBadgesOpen, setIsMeritBadgesOpen] = useState(false);
  const [shuffledOptions, setShuffledOptions] = useState<string[]>([]);
  const [errorFeedback, setErrorFeedback] = useState('');

  // Defer AI initialization to prevent crash on load if process.env is not immediately available.
  const getAi = () => new GoogleGenAI({ apiKey: process.env.API_KEY! });
  
  const getCacheKey = (categories: string[]) => {
    // Sort categories to ensure the key is consistent regardless of selection order
    return `scout-trivia-cache-${[...categories].sort().join('-')}`;
  };

  const shuffleArray = (array: any[]) => {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
  };
  
  useEffect(() => {
    if (gameStatus === GameStatus.PLAYING && activeCategory) {
      const currentQuestion = questionsByCategory[activeCategory]?.[currentCategoryQuestionIndex];
      if (currentQuestion) {
        setShuffledOptions(shuffleArray(currentQuestion.options));
      }
    }
  }, [gameStatus, activeCategory, currentCategoryQuestionIndex, questionsByCategory]);


  const SPECIAL_CATEGORY_PROMPTS: Record<string, string> = {
    "Scout Trivia": "Base questions on the Scouting Heritage merit badge pamphlet.",
    "Scout Rank": "Base questions on the current Scout Rank requirements found on the official Scouting America advancement page (https://www.scouting.org/programs/scouts-bsa/advancement-and-awards/). In the question text, clearly state it is for 'Scout Rank'.",
    "Tenderfoot Rank": "Base questions on the current Tenderfoot Rank requirements found on the official Scouting America advancement page (https://www.scouting.org/programs/scouts-bsa/advancement-and-awards/). In the question text, clearly state it is for 'Tenderfoot Rank'.",
    "Second Class Rank": "Base questions on the current Second Class Rank requirements found on the official Scouting America advancement page (https://www.scouting.org/programs/scouts-bsa/advancement-and-awards/). In the question text, clearly state it is for 'Second Class Rank'.",
    "First Class Rank": "Base questions on the current First Class Rank requirements found on the official Scouting America advancement page (https://www.scouting.org/programs/scouts-bsa/advancement-and-awards/). In the question text, clearly state it is for 'First Class Rank'.",
    "Flag Etiquette": "Base questions on United States Federal government publications regarding US Flag Etiquette (e.g., the U.S. Flag Code)."
  };

  const generateQuestions = useCallback(async () => {
    try {
      const ai = getAi();
      const questionSchema = {
        type: Type.OBJECT,
        properties: {
          questionText: { type: Type.STRING },
          options: { type: Type.ARRAY, items: { type: Type.STRING } },
          correctAnswer: { type: Type.STRING },
        },
        required: ['questionText', 'options', 'correctAnswer']
      };
      
      const questionsSchema = { type: Type.ARRAY, items: questionSchema };

      const promises = selectedCategories.map(category => {
        const promptDetails = SPECIAL_CATEGORY_PROMPTS[category] || `Base questions on the "${category}" merit badge pamphlet.`;
        const prompt = `You are a trivia game creator specializing in Scouting America. Generate exactly 10 unique multiple-choice trivia questions for the category "${category}". ${promptDetails} Each question must have 4 options, with only one being correct. All information must come from official Scouting America sources or US Federal government publications ONLY. DO NOT use any other sources. Do not invent answers or information. If you cannot find information in the official source, do not create the question. The 'correctAnswer' must exactly match one of the 'options'. Avoid questions similar to these: ${recentlyAsked.join(', ')}`;
        
        return ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: questionsSchema,
          },
        });
      });

      const responses = await Promise.all(promises);
      const allNewQuestions: Record<string, Question[]> = {};
      const newQuestionTexts = new Set<string>();

      responses.forEach((response, index) => {
        const category = selectedCategories[index];
        const parsedQuestions = JSON.parse(response.text) as Omit<Question, 'category'>[];
        
        allNewQuestions[category] = parsedQuestions.map(q => {
            newQuestionTexts.add(q.questionText);
            return { ...q, category };
        });
      });
      
      const cacheKey = getCacheKey(selectedCategories);
      const cacheData = {
          timestamp: Date.now(),
          questions: allNewQuestions,
      };
      localStorage.setItem(cacheKey, JSON.stringify(cacheData));

      setQuestionsByCategory(allNewQuestions);
      setRecentlyAsked(prev => [...prev.slice(-100), ...Array.from(newQuestionTexts)]);
      setGameStatus(GameStatus.CATEGORY_HUB);
    } catch (err) {
      console.error("Error generating questions:", err);
      setError("Failed to generate questions. The Scouting world is vast and mysterious! Please try again.");
      setGameStatus(GameStatus.SELECTING);
    }
  }, [selectedCategories, recentlyAsked]);

  const handleStartGame = () => {
    setError(null);
    
    const cacheKey = getCacheKey(selectedCategories);
    const cachedItem = localStorage.getItem(cacheKey);

    if (cachedItem) {
        try {
            const parsedCache = JSON.parse(cachedItem);
            const cacheAge = Date.now() - parsedCache.timestamp;
            const sixMonthsInMs = 180 * 24 * 60 * 60 * 1000;

            if (cacheAge < sixMonthsInMs && parsedCache.questions) {
                setQuestionsByCategory(parsedCache.questions);
                setGameStatus(GameStatus.CATEGORY_HUB);
                return; // Exit function to skip API call
            } else {
                localStorage.removeItem(cacheKey); // Remove expired cache
            }
        } catch (e) {
            console.error("Failed to parse cache, removing it.", e);
            localStorage.removeItem(cacheKey);
        }
    }
    
    setGameStatus(GameStatus.LOADING);
    generateQuestions();
  };

  const handleCategorySelect = (category: string) => {
    setSelectedCategories(prev => {
      if (prev.includes(category)) {
        return prev.filter(c => c !== category);
      }
      if (prev.length < 4) {
        return [...prev, category];
      }
      return prev;
    });
  };

  const moveToNext = useCallback(() => {
    setFeedback(null);
    setErrorFeedback(''); // Clear feedback on next question
    const categoryQuestions = questionsByCategory[activeCategory!];
    if (currentCategoryQuestionIndex < categoryQuestions.length - 1) {
      setCurrentCategoryQuestionIndex(prev => prev + 1);
    } else {
      const newCompleted = new Set(completedCategories).add(activeCategory!);
      setCompletedCategories(newCompleted);
      setActiveCategory(null);
      if (newCompleted.size === selectedCategories.length) {
        setGameStatus(GameStatus.FINISHED);
      } else {
        setGameStatus(GameStatus.CATEGORY_HUB);
      }
    }
  }, [activeCategory, completedCategories, currentCategoryQuestionIndex, questionsByCategory, selectedCategories.length]);

  const handleAnswer = (answer: string) => {
    if (feedback) return;
    const currentQuestion = questionsByCategory[activeCategory!][currentCategoryQuestionIndex];
    const isCorrect = answer === currentQuestion.correctAnswer;
    setFeedback({ message: isCorrect ? 'Correct!' : 'Incorrect!', isCorrect });
    setUserAnswers(prev => [...prev, {
      question: currentQuestion.questionText, answer, correctAnswer: currentQuestion.correctAnswer, isCorrect,
    }]);
    setTimeout(moveToNext, 1500);
  };

  const handleSkip = () => {
    if (feedback) return;
    const currentQuestion = questionsByCategory[activeCategory!][currentCategoryQuestionIndex];
    setFeedback({ message: `Answer: ${currentQuestion.correctAnswer}`, isCorrect: false });
    setUserAnswers(prev => [...prev, {
      question: currentQuestion.questionText, answer: "Skipped", correctAnswer: currentQuestion.correctAnswer, isCorrect: false,
    }]);
    setTimeout(moveToNext, 2000);
  };
  
  const handleGoHome = () => {
    setSelectedCategories([]);
    setQuestionsByCategory({});
    setCompletedCategories(new Set());
    setUserAnswers([]);
    setActiveCategory(null);
    setError(null);
    setGameStatus(GameStatus.SELECTING);
  };

  const handleGoToHub = () => {
    setActiveCategory(null);
    setGameStatus(GameStatus.CATEGORY_HUB);
  };
  
  const handleSelectCategoryFromHub = (category: string) => {
    setActiveCategory(category);
    setCurrentCategoryQuestionIndex(0);
    setGameStatus(GameStatus.PLAYING);
  };

  const handleSubmitFeedback = () => {
    const q = questionsByCategory[activeCategory!][currentCategoryQuestionIndex];
    if (!q) return;
    const mailtoHref = `mailto:errors@scoutrivia.com?subject=${encodeURIComponent(
      `Scout Trivia Error Report: ${q.category}`
    )}&body=${encodeURIComponent(
      `Hi, I found a potential error.\n\n` +
      `Category: ${q.category}\n` +
      `Question: ${q.questionText}\n` +
      `Options: ${q.options.join(', ')}\n` +
      `Correct Answer given: ${q.correctAnswer}\n\n` +
      `My Feedback:\n${errorFeedback}`
    )}`;
    window.location.href = mailtoHref;
  };

  const renderContent = () => {
    switch (gameStatus) {
      case GameStatus.SELECTING:
        return (
          <div className="text-center w-full max-w-7xl">
            <h1 className="text-4xl sm:text-5xl font-bold text-sky-800 dark:text-sky-300 mb-4">Welcome to the Challenge!</h1>
            <p className="text-lg text-gray-700 dark:text-gray-300 mb-6">To begin your adventure, explore the topics below and select exactly four categories for your trivia game.</p>
            <button
              onClick={handleStartGame}
              disabled={selectedCategories.length !== 4}
              className="px-8 py-3 bg-blue-600 text-white font-bold rounded-lg shadow-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors mb-6"
            >
              Start Game ({selectedCategories.length}/4)
            </button>
            {error && <p className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">{error}</p>}
            {Object.entries(CATEGORY_GROUPS).map(([groupName, categories]) => {
                const isMeritBadgeGroup = groupName === 'Merit Badges';
                return (
                  <div key={groupName} className="mb-8 text-left">
                    <div
                      className="w-full text-left text-2xl font-semibold text-gray-800 dark:text-gray-200 border-b-2 border-sky-500 mb-4 pb-2 flex justify-between items-center cursor-pointer"
                      onClick={() => isMeritBadgeGroup && setIsMeritBadgesOpen(!isMeritBadgesOpen)}
                    >
                      <span>{groupName}</span>
                      {isMeritBadgeGroup && (
                        <span className="text-xl font-mono">{isMeritBadgesOpen ? '[-]' : '[+]'}</span>
                      )}
                    </div>
                    {(!isMeritBadgeGroup || isMeritBadgesOpen) && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {categories.map(category => (
                          <button
                            key={category}
                            onClick={() => handleCategorySelect(category)}
                            className={`p-3 h-full rounded-lg shadow-md transition-all duration-200 text-sm font-semibold flex items-center justify-center ${
                              selectedCategories.includes(category)
                                ? 'bg-green-600 text-white ring-2 ring-green-400'
                                : 'bg-white dark:bg-gray-700 hover:bg-sky-100 dark:hover:bg-gray-600'
                            }`}
                          >
                            {category}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
            })}
            <button
              onClick={handleStartGame}
              disabled={selectedCategories.length !== 4}
              className="px-8 py-3 bg-blue-600 text-white font-bold rounded-lg shadow-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              Start Game ({selectedCategories.length}/4)
            </button>
          </div>
        );

      case GameStatus.LOADING:
        return (
          <div className="text-center flex flex-col items-center justify-center h-full">
             <div className="animate-spin rounded-full h-32 w-32 border-t-4 border-b-4 border-blue-500 mb-4"></div>
            <h2 className="text-3xl font-bold text-sky-800 dark:text-sky-300">Preparing Your Challenge...</h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 mt-2">Gathering knowledge from the digital wilderness!</p>
          </div>
        );
        
      case GameStatus.CATEGORY_HUB:
        return (
          <div className="text-center w-full max-w-4xl">
            <h1 className="text-4xl font-bold text-sky-800 dark:text-sky-300 mb-4">Category Hub</h1>
            <p className="text-lg text-gray-700 dark:text-gray-300 mb-8">Select a category to begin a 10-question round.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {selectedCategories.map(category => (
                <button
                  key={category}
                  onClick={() => handleSelectCategoryFromHub(category)}
                  disabled={completedCategories.has(category)}
                  className="p-8 rounded-lg shadow-lg transition-transform transform hover:scale-105 disabled:opacity-50 disabled:transform-none disabled:cursor-not-allowed bg-white dark:bg-gray-700 disabled:bg-gray-300 dark:disabled:bg-gray-600"
                >
                  <span className="text-xl font-semibold">{category}</span>
                  {completedCategories.has(category) && <span className="text-green-500 text-2xl block mt-2">✔ Complete</span>}
                </button>
              ))}
            </div>
            <button onClick={handleGoHome} className="mt-12 px-6 py-2 bg-gray-500 text-white font-bold rounded-lg shadow hover:bg-gray-600 transition-colors">
              Start Over
            </button>
          </div>
        );

      case GameStatus.PLAYING:
        const q = questionsByCategory[activeCategory!][currentCategoryQuestionIndex];
        return (
           <div className="w-full max-w-4xl mx-auto text-center">
            <div className="mb-4 text-gray-700 dark:text-gray-300">
              <span className="font-bold text-lg">Question {currentCategoryQuestionIndex + 1} of 10</span>
              <span className="mx-2">|</span>
              <span className="italic font-semibold text-sky-700 dark:text-sky-400">{q.category}</span>
            </div>
            <p className="text-2xl sm:text-3xl font-semibold mb-8 min-h-[100px] flex items-center justify-center">{q.questionText}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {shuffledOptions.map((option, index) => (
                <button
                  key={index}
                  onClick={() => handleAnswer(option)}
                  disabled={!!feedback}
                  className={`p-4 rounded-lg shadow-md transition-all duration-200 text-left w-full h-full flex items-center
                  ${feedback && option === q.correctAnswer ? 'bg-green-500 text-white animate-pulse' : ''}
                  ${feedback && option !== q.correctAnswer && userAnswers[userAnswers.length -1]?.answer === option ? 'bg-red-500 text-white' : ''}
                  ${!feedback ? 'bg-white dark:bg-gray-700 hover:bg-sky-100 dark:hover:bg-gray-600' : 'bg-gray-200 dark:bg-gray-600 cursor-not-allowed'}
                  `}
                >
                  {option}
                </button>
              ))}
            </div>
            {feedback && <div className={`mt-6 text-2xl font-bold ${feedback.isCorrect ? 'text-green-500' : 'text-red-500'}`}>{feedback.message}</div>}
             <div className="mt-8 flex flex-col sm:flex-row justify-center items-center gap-4 w-full">
                <button onClick={handleGoToHub} className="px-6 py-2 bg-gray-500 text-white font-semibold rounded-lg shadow hover:bg-gray-600 transition-colors">Return to Categories</button>
                <button onClick={handleSkip} disabled={!!feedback} className="px-6 py-2 bg-yellow-500 text-white font-semibold rounded-lg shadow hover:bg-yellow-600 transition-colors disabled:bg-gray-400">Skip Question</button>
                <button onClick={handleGoHome} className="px-6 py-2 bg-gray-500 text-white font-semibold rounded-lg shadow hover:bg-gray-600 transition-colors">Return to Home</button>
             </div>

             <div className="mt-12 border-t pt-6 text-sm text-gray-600 dark:text-gray-400">
                <p className="mb-2">The AI operating this site does make occasional errors. Please help us improve by reporting any issues.</p>
                <div className="flex flex-col sm:flex-row items-center gap-2">
                    <textarea
                      value={errorFeedback}
                      onChange={(e) => setErrorFeedback(e.target.value)}
                      placeholder="Describe the error here..."
                      className="w-full sm:w-auto flex-grow p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600"
                      rows={1}
                    ></textarea>
                    <button onClick={handleSubmitFeedback} className="w-full sm:w-auto px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition-colors">
                        Submit Feedback
                    </button>
                </div>
             </div>
          </div>
        );

      case GameStatus.FINISHED:
         const correctAnswers = userAnswers.filter(a => a.isCorrect).length;
        return (
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl font-bold text-sky-800 dark:text-sky-300 mb-4">Challenge Complete!</h1>
            <p className="text-3xl mb-6">Your Final Score: {correctAnswers} / {userAnswers.length}</p>
            <div className="text-left max-w-4xl mx-auto bg-white dark:bg-gray-800 p-4 rounded-lg shadow-inner max-h-96 overflow-y-auto">
              {userAnswers.map((answer, index) => (
                <div key={index} className="border-b dark:border-gray-600 py-2">
                  <p className="font-semibold">{index + 1}. {answer.question}</p>
                  <p className={answer.isCorrect ? 'text-green-600' : 'text-red-600'}>Your answer: {answer.answer} {answer.isCorrect ? '✔' : '✖'}</p>
                  {!answer.isCorrect && <p className="text-sm text-gray-600 dark:text-gray-400">Correct answer: {answer.correctAnswer}</p>}
                </div>
              ))}
            </div>
            <button onClick={handleGoHome} className="mt-6 px-8 py-3 bg-blue-600 text-white font-bold rounded-lg shadow-lg hover:bg-blue-700 transition-colors">
              Play Again
            </button>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col min-h-screen text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-900">
      <AppHeader />
      <div className="flex flex-1 overflow-hidden">
        <aside className="hidden lg:flex w-48 bg-gray-200 dark:bg-gray-800 p-4 flex-shrink-0 items-center justify-center">
            <div className="h-full w-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center text-sm text-gray-500">Vertical Ad</div>
        </aside>

        <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto flex items-center justify-center">
            {renderContent()}
        </main>

        <aside className="hidden lg:flex w-48 bg-gray-200 dark:bg-gray-800 p-4 flex-shrink-0 items-center justify-center">
            <div className="h-full w-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center text-sm text-gray-500">Vertical Ad</div>
        </aside>
      </div>
      <footer className="lg:hidden bg-gray-200 dark:bg-gray-800 p-4 flex-shrink-0 flex items-center justify-center">
          <div className="h-20 w-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center text-sm text-gray-500">Horizontal Ad</div>
      </footer>
    </div>
  );
};

export default App;
