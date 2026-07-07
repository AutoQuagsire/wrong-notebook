-- CreateTable
CREATE TABLE "KnowledgeItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "detail" TEXT,
    "deck" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "tagId" TEXT,
    "questionType" TEXT DEFAULT 'DICTATION',
    "source" TEXT,
    "manualDifficulty" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "KnowledgeItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KnowledgeItem_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KnowledgeItem_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "KnowledgeTag" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KnowledgeReviewState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "knowledgeItemId" TEXT NOT NULL,
    "due" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stability" REAL,
    "difficulty" REAL,
    "elapsed_days" INTEGER NOT NULL DEFAULT 0,
    "scheduled_days" INTEGER NOT NULL DEFAULT 0,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "state" TEXT NOT NULL DEFAULT 'New',
    "last_review" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "KnowledgeReviewState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KnowledgeReviewState_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "KnowledgeItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KnowledgeReviewLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "knowledgeItemId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "isCorrect" BOOLEAN,
    "answerText" TEXT,
    "durationSeconds" INTEGER,
    "nextReviewAt" DATETIME,
    "scheduledDays" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgeReviewLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KnowledgeReviewLog_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "KnowledgeItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "KnowledgeItem_userId_subjectId_idx" ON "KnowledgeItem"("userId", "subjectId");

-- CreateIndex
CREATE INDEX "KnowledgeItem_userId_deck_idx" ON "KnowledgeItem"("userId", "deck");

-- CreateIndex
CREATE INDEX "KnowledgeItem_tagId_idx" ON "KnowledgeItem"("tagId");

-- CreateIndex
CREATE INDEX "KnowledgeItem_subjectId_idx" ON "KnowledgeItem"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeReviewState_knowledgeItemId_key" ON "KnowledgeReviewState"("knowledgeItemId");

-- CreateIndex
CREATE INDEX "KnowledgeReviewState_userId_due_idx" ON "KnowledgeReviewState"("userId", "due");

-- CreateIndex
CREATE INDEX "KnowledgeReviewLog_userId_createdAt_idx" ON "KnowledgeReviewLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeReviewLog_knowledgeItemId_createdAt_idx" ON "KnowledgeReviewLog"("knowledgeItemId", "createdAt");
