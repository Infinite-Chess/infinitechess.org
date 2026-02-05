// Test case for multi-line imports with ts-ignore
// Multi-line imports with ts-ignore should be detected correctly

import express from 'express';

// @ts-ignore
import {
	longFunctionName,
	anotherLongFunction,
	yetAnotherFunction,
} from './utilities';
