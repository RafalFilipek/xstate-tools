import * as fs from "fs/promises";
import * as prettier from "prettier";
import { getTypegenOutput } from ".";

export const writeToTypegenFile = async (opts: {
  filePath: string;
  event: Parameters<typeof getTypegenOutput>[0];
}) => {
  const prettierConfig = await prettier.resolveConfig(opts.filePath);
  const pathToSave = opts.filePath.replace(
    /\.(cjs|mjs|js|tsx|ts|jsx)$/,
    ".typegen.ts",
  );

  try {
    if (opts.event.machines.some((machine) => machine.hasTypesNode)) {
      const typegenOutput = getTypegenOutput(opts.event);
      await fs.writeFile(
        pathToSave,
        prettier.format(typegenOutput, {
          ...prettierConfig,
          parser: "typescript",
        }),
      );
    } else {
      try {
        await fs.unlink(pathToSave);
      } catch (e) {
        // TODO - throw the error if it's not an ENOENT
      }
    }
  } catch (e) {
    console.log(e);
  }
};
