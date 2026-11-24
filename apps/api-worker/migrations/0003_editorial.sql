CREATE TABLE IF NOT EXISTS "BlogPost" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "slug" TEXT NOT NULL UNIQUE,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "coverUrl" TEXT NOT NULL DEFAULT '',
  "published" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "StoryVideo" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "url" TEXT NOT NULL UNIQUE,
  "caption" TEXT NOT NULL DEFAULT '',
  "position" INTEGER NOT NULL DEFAULT 0,
  "published" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TEXT NOT NULL
);

INSERT OR IGNORE INTO "StoryVideo" ("id","url","caption","position","published","createdAt") VALUES
('ig-Dfw26xMoAcz','https://www.instagram.com/reel/Dfw26xMoAcz/','From @almost.formal',1,1,'2026-11-25T00:00:00.000Z'),
('ig-DfzR3-VofIM','https://www.instagram.com/reel/DfzR3-VofIM/','From @almost.formal',2,1,'2026-11-25T00:00:00.000Z'),
('ig-Df2ZyX3ouxs','https://www.instagram.com/reel/Df2ZyX3ouxs/','From @almost.formal',3,1,'2026-11-25T00:00:00.000Z'),
('ig-Df4niAAon7l','https://www.instagram.com/reel/Df4niAAon7l/','From @almost.formal',4,1,'2026-11-25T00:00:00.000Z'),
('ig-DgCZbfXoORX','https://www.instagram.com/reel/DgCZbfXoORX/','From @almost.formal',5,1,'2026-11-25T00:00:00.000Z');
