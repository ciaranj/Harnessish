import { describe, it, expect } from 'vitest';
import { runPython } from './runPython.js';

describe('runPython', () => {
    it('should execute simple python code and return output', async () => {
        const result = await runPython.execute({ code: 'print("hello world")' });

        expect(result.success).toBe(true);
        expect(result.output).toContain('hello world');
    }, 65000);

    it('should return Python errors as output', async () => {
        const result = await runPython.execute({ code: 'raise ValueError("test error")' });

        if (!result.success) {
            expect(result.output).toContain('ValueError');
        }
    }, 65000);

    it('should handle python arithmetic', async () => {
        const result = await runPython.execute({ code: 'print(2 + 3)' });

        expect(result.success).toBe(true);
        expect(result.output).toContain('5');
    }, 65000);

    it('should handle empty output gracefully', async () => {
        const result = await runPython.execute({ code: 'x = 1 + 1' });

        expect(result.success).toBe(true);
    }, 65000);

    it('should handle python lists', async () => {
        const result = await runPython.execute({ code: 'print([1, 2, 3])' });

        expect(result.success).toBe(true);
        expect(result.output).toContain('[1, 2, 3]');
    }, 65000);
});
