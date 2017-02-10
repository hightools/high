'use strict';

import IAM from 'aws-sdk/clients/iam';
import { task, formatMessage } from '@voila/common';
import sleep from 'sleep-promise';

const IAM_ROLE_NAME = 'voila-module-default-role-v1';
const IAM_POLICY_NAME = 'basic-lambda-policy';

const IAM_ASSUME_ROLE_POLICY_DOCUMENT = {
  Version: '2012-10-17',
  Statement: [
    {
      Effect: 'Allow',
      Principal: {
        Service: 'lambda.amazonaws.com'
      },
      Action: 'sts:AssumeRole'
    }
  ]
};

const IAM_POLICY_DOCUMENT = {
  Version: '2012-10-17',
  Statement: [
    {
      Action: [
        'logs:*'
      ],
      Effect: 'Allow',
      Resource: '*'
    }
  ]
};

export async function ensureDefaultRole({ name, stage, awsConfig }) {
  const iam = new IAM(awsConfig);

  let role, hasBeenCreated;

  const msg = formatMessage({ name, stage, message: 'Checking IAM default role' });
  role = await task(msg, async () => {
    try {
      const result = await iam.getRole({ RoleName: IAM_ROLE_NAME }).promise();
      return result.Role.Arn;
    } catch (err) {
      if (err.code !== 'NoSuchEntity') throw err;
      return undefined;
    }
  });

  if (!role) {
    const msg = formatMessage({ name, stage, message: 'Creating IAM default role' });
    role = await task(msg, async () => {
      const assumeRolePolicyDocument = JSON.stringify(
        IAM_ASSUME_ROLE_POLICY_DOCUMENT,
        undefined,
        2
      );
      const result = await iam.createRole({
        RoleName: IAM_ROLE_NAME,
        AssumeRolePolicyDocument: assumeRolePolicyDocument
      }).promise();

      const policyDocument = JSON.stringify(IAM_POLICY_DOCUMENT, undefined, 2);
      await iam.putRolePolicy({
        RoleName: IAM_ROLE_NAME,
        PolicyName: IAM_POLICY_NAME,
        PolicyDocument: policyDocument
      }).promise();

      await sleep(3000); // Wait 3 secs so AWS can replicate the role in all regions

      return result.Role.Arn;
    });

    hasBeenCreated = true;
  }

  return { role, hasBeenCreated };
}