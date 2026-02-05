// Test case for inline type imports
// TypeScript 4.5+ allows inline type imports

import express from 'express';

import { type Config, loadConfig } from './config';
import { type User, getName } from './models';
