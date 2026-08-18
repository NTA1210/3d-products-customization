CREATE TABLE "ColorPreset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hex" TEXT NOT NULL,
    "styleTags" TEXT[] NOT NULL,
    "compatibleMaterialCategories" TEXT[] NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ColorPreset_pkey" PRIMARY KEY ("id")
);
