# Domain

## Entities

### User
- Represents a student or admin.
- Fields: `id`, `name`, `email`, `handle`, `passwordHash`, `role`, `createdAt`.
- Roles: `student` (default), `admin`.

### Subject
- Represents an exam subject (e.g., Bengali, English, Bangladesh Affairs).
- Fields: `id`, `nameBn`, `nameEn`, `icon`, `color`, `bg`, `sortOrder`.
- Related: `topics`, `questions`, `flashcards`, `categories`.

### Topic
- Sub-topic within a subject.
- Fields: `id`, `subjectId`, `groupName`, `name`, `questionCount`.

### Question
- A multiple-choice question.
- Fields: `id`, `subjectId`, `topic`, `question`, `options`, `correctAnswer`, `explanation`, `difficulty`, `year`, `sourceExam`.
- Difficulty: `EASY`, `MEDIUM`, `HARD`.

### Flashcard
- Spaced-repetition card.
- Fields: `id`, `subjectId`, `subjectName`, `question`, `answer`, `hint`, `difficulty`, `nextReview`, `interval`, `easeFactor`, `repetitions`.

### StudyPlanDay / StudyTask
- Daily study plan with tasks.
- Fields: `day`, `date`, `totalMinutes`, `focusAreas`, `tasks[]`.

### DailyQuiz / QuizQuestion
- Daily quiz with questions.
- Fields: `date`, `completed`, `score`, `claimed`, `questions[]`.

### MockTest / MockTestQuestion
- Mock test with questions.
- Fields: `title`, `subject`, `totalQuestions`, `duration`, `questions[]`.

### FlashNews
- News and updates feed.
- Fields: `tag`, `titleBn`, `titleEn`, `text`, `full`, `date`, `readTime`, `categoryBn`, `categoryEn`.

### Recommendation
- Personalized study recommendations.
- Fields: `subjectBn`, `subjectEn`, `metric`, `accuracy`, `titleBn`, `titleEn`, `descriptionBn`, `descriptionEn`, `ctaBn`, `ctaEn`.

### Badge
- Achievement badge.
- Fields: `name`, `description`, `icon`, `rarity`, `unlockedSeed`.

### AppNotification
- In-app notification.
- Fields: `title`, `message`, `type`, `timestamp`, `read`.

### OfflinePack
- Offline content pack metadata.
- Fields: `name`, `size`, `downloaded`, `subject`.

### Document
- Syllabus PDFs, circulars, guides.
- Fields: `title`, `category`, `type`, `url`, `description`, `year`.

### UserProgress
- Per-user gamification state.
- Fields: `points`, `streak`, `accuracy`, `questionsAnswered`, `flashcardsReviewed`, `aiQuestionsAsked`, `examsAttempted`, `rank`.

### Bookmark
- User-bookmarked question.
- Fields: `userId`, `questionId`.

## Business Rules

1. Authentication is required for dashboard features (`/dashboard`).
2. Users can view public content (syllabus, questions) without logging in, but progress and bookmarks require auth.
3. Daily quizzes reset daily; completion is tracked per user.
4. Mock tests are timed; score is recorded in progress.
5. Flashcard SRS uses SM-2 algorithm (ease factor, interval, repetitions).
6. Study tasks can be toggled complete/incomplete.
7. AI Tutor and Solver require `ANTHROPIC_API_KEY` for real responses; otherwise return labelled mock data.
8. Seed data is idempotent — safe to run repeatedly.
