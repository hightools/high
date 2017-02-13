'use strict';

import { join } from 'path';
import { existsSync } from 'fs';
import semver from 'semver';
import chalk from 'chalk';
import ora from 'ora';

export function getPackage(inputDir) {
  return require(join(inputDir, 'package.json'));
}

export function isYarnPreferred({ inputDir, yarn }) {
  if (yarn != null) return !!yarn;

  const execPath = process.env.npm_execpath;
  if (execPath && execPath.endsWith('yarn.js')) return true;

  if (existsSync(join(inputDir, 'yarn.lock'))) return true;

  return false;
}

export function generateDeploymentName({ name, version, stage }) {
  // Handle scoped name case
  if (name.slice(0, 1) === '@') name = name.slice(1);
  name = name.replace(/\//g, '-');

  version = createCompatibleVersionRange(version);

  let deploymentName = `${name}-${version}-${stage}`;
  deploymentName = deploymentName.replace(/\./g, '-');

  return deploymentName;
}

function createCompatibleVersionRange(version) {
  const major = semver.major(version);
  if (major >= 1) {
    return `${major}.x.x`;
  } else {
    const minor = semver.minor(version);
    return `${major}.${minor}.x`;
  }
}

export async function task(message, successMessage, fn) {
  if (typeof successMessage === 'function') {
    fn = successMessage;
    successMessage = undefined;
  }
  const spinner = ora(message).start();
  const currentTask = {
    setMessage(message) { spinner.text = message; },
    setSuccessMessage(message) { successMessage = message; }
  };
  try {
    const result = await fn(currentTask);
    spinner.succeed(successMessage);
    return result;
  } catch (err) {
    spinner.fail();
    throw err;
  }
}

export function formatMessage({ status, name, stage, message, info }) {
  if (status === 'success') {
    status = `${chalk.green('✔')} `;
  } else if (status === 'error') {
    status = `${chalk.red('✘')} `;
  } else if (status === undefined) {
    status = '';
  } else {
    throw new Error('Invalid status: ' + status);
  }

  let nameAndStage;
  if (name) {
    nameAndStage = name;
    if (stage) nameAndStage += ` (${stage})`;
    nameAndStage += ':';
    nameAndStage = chalk.gray(nameAndStage);
    nameAndStage += ' ';
  } else {
    nameAndStage = '';
  }

  if (info) {
    info = ` ${chalk.gray(`(${info})`)}`;
  } else {
    info = '';
  }

  return `${status}${nameAndStage}${message}${info}`;
}

export function createUserError(message) {
  const err = new Error(message);
  err.userError = true;
  return err;
}

export function showError(error) {
  if (typeof error === 'string') {
    error = createUserError(error);
  }
  if (error.userError) {
    console.error(formatMessage({ status: 'error', message: error.message }));
  } else {
    console.error(error);
  }
}

export function showErrorAndExit(error, code = 1) {
  showError(error);
  process.exit(code);
}

export function getAWSConfig(defaults, env, config, argv) {
  const accessKeyId = argv['aws-access-key-id'] || config.accessKeyId || env.AWS_ACCESS_KEY_ID;
  if (!accessKeyId) {
    showErrorAndExit('\'aws-access-key-id\' parameter or \'AWS_ACCESS_KEY_ID\' environment variable is missing');
  }

  const secretAccessKey = argv['aws-secret-access-key'] || config.secretAccessKey || env.AWS_SECRET_ACCESS_KEY;
  if (!secretAccessKey) {
    showErrorAndExit('\'aws-secret-access-key\' parameter or \'AWS_SECRET_ACCESS_KEY\' environment variable is missing');
  }

  const region = argv['aws-region'] || config.region || env.AWS_REGION || defaults.region;

  return { accessKeyId, secretAccessKey, region };
}

export function getEnvironmentConfig(configEnvironment, argvEnvironment) {
  const environment = {};

  Object.assign(environment, configEnvironment);

  if (argvEnvironment == null) {
    argvEnvironment = [];
  } else if (typeof argvEnvironment === 'string') {
    argvEnvironment = [argvEnvironment];
  }
  for (const item of argvEnvironment) {
    const [key, value, ...rest] = item.split('=');
    if (!key || !value || rest.length) {
      showErrorAndExit(`'environment' parameter is invalid (${item})`);
    }
    environment[key] = value;
  }

  return environment;
}
