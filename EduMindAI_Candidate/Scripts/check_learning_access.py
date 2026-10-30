"""Static regression assertions for the Step 24 source patch.

This is NOT a replacement for dotnet build or cross-account integration tests.
Run: python Scripts/check_learning_access.py from the repository root.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API = ROOT / 'backend' / 'EduMind.Api'

def source(relative):
    file = API / relative
    assert file.is_file(), f'Missing: {file}'
    return file.read_text(encoding='utf-8-sig')

access = source('Services/LearningApiAccess.cs')
assert '_environment.IsDevelopment() ||' in access
assert '_configuration.GetValue<bool>("Features:EnableLearningApi", false)' in access

checks = {
    'DocumentsController': (6, True),
    'AiTutorController': (1, True),
    'DocumentSummariesController': (2, True),
    'QuizzesController': (3, True),
    'QuizAttemptsController': (4, True),
    'LearningProgressController': (1, True),
}
for name, (guards, ownership) in checks.items():
    s = source(f'Controllers/{name}.cs')
    assert '[Authorize]' in s, f'{name}: missing authentication'
    assert s.count('_learningAccess.Enabled') == guards, f'{name}: wrong feature guards'
    assert 'OwnerUserId' in s, f'{name}: missing owner filtering'
    if name == 'DocumentSummariesController':
        assert s.count('!CanUseHistory()') == 3, 'summary history endpoints not gated'
    assert '!_environment.IsDevelopment()' not in s and '!_env.IsDevelopment()' not in s
    print(f'[PASS] {name}: auth + ownership + release gate')

for name in ('AiTutorController', 'DocumentSummariesController', 'QuizzesController'):
    assert '[EnableRateLimiting("ai-heavy")]' in source(f'Controllers/{name}.cs')
assert source('Controllers/DocumentsController.cs').count('[EnableRateLimiting("pdf-write")]') == 2
assert 'detail = ex.Message' not in source('Controllers/DocumentsController.cs')

program = source('Program.cs')
assert 'AddSingleton<LearningApiAccess>()' in program
assert 'AddPolicy("ai-heavy"' in program and 'AddPolicy("pdf-write"' in program
assert program.index('app.UseAuthentication();') < program.index('app.UseRateLimiter();') < program.index('app.UseAuthorization();')
assert 'Cors:AllowedOrigins' in program
print('[PASS] DI + per-user rate limiting + configurable CORS + sanitized PDF errors')
print('STATIC CHECKS PASSED; still run dotnet build and manual role tests.')
