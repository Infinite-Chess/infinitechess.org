// Test case for path aliases
// Aliases like @/components should be treated as source, not package imports

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import express from 'express';
import { util } from './util';
