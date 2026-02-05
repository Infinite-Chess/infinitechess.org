// Test case for inline type imports
// TypeScript 4.5+ allows inline type imports

import { type User, getName } from './models';
import { type Config, loadConfig } from './config';
import express from 'express';
