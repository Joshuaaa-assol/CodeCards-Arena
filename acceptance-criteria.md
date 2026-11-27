Acceptance Criteria – CodeCards Arena

Feature: User Registration and Login
US1: Create an Account
- AC1.1: Given that I am a new user, when I enter a valid nickname, email, and password, then the system should successfully create my account.
- AC1.2: Given that I leave required fields empty or enter invalid information, when I submit the registration form, then the system should display an appropriate validation message.

Feature: Coding Quiz and Practice
US2: Select and Play Coding Quizzes
- AC2.1: Given that I open the quiz configuration, when I select a programming language, topic, difficulty, and game mode, then the system should display the available quiz settings.
- AC2.2: Given that I start a quiz session, when the questions are loaded from QuizAPI, then I should be able to answer the displayed multiple-choice programming questions.

Feature: Leaderboard and Performance Tracking
US3: View Global Leaderboard
- AC3.1: Given that I open the leaderboard, when participant records are available, then the system should display users ranked according to their Elo ratings.
- AC3.2: Given that I view the leaderboard, when my account appears in the rankings, then the system should highlight my position and display my current Elo rating.