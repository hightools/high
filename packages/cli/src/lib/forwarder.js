'use strict';

import { red, cyan } from 'chalk';
import { getPackage, createUserError } from '@voila/common';
import { run } from './runner';

export async function forward({ inputDir, args }) {
  const pkg = getPackage(inputDir);

  const type = pkg.voila && pkg.voila.type;
  if (!type) {
    throw createUserError(`${red('Unknown package type!')} Please run ${cyan('`voila init <package-type>`')} at the root of your package to initialize it.`);
  }

  await run({ inputDir, type, args });
}
