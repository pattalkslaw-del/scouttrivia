
export interface Question {
  category: string;
  questionText: string;
  options: string[];
  correctAnswer: string;
}

export enum GameStatus {
  SELECTING = 'selecting',
  LOADING = 'loading',
  CATEGORY_HUB = 'category_hub',
  PLAYING = 'playing',
  FINISHED = 'finished'
}

export type UserAnswer = {
  question: string;
  answer: string;
  correctAnswer: string;
  isCorrect: boolean;
};