using Microsoft.AspNetCore.Authorization;

using EduMind.Api.Data;
using EduMind.Api.DTOs;
using EduMind.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EduMind.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/subjects")]
public class SubjectsController : ControllerBase
{
    private readonly EduMindDbContext _context;

    public SubjectsController(EduMindDbContext context)
    {
        _context = context;
    }

    // 1. Lấy danh sách và tìm kiếm môn học
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? search,
        [FromQuery] bool? active)
    {
        var query = _context.Subjects
            .AsNoTracking()
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            string keyword = search.Trim();

            query = query.Where(x =>
                x.Name.Contains(keyword) ||
                x.Code.Contains(keyword));
        }

        if (active.HasValue)
        {
            query = query.Where(x =>
                x.IsActive == active.Value);
        }

        var subjects = await query
            .OrderBy(x => x.Id)
            .ToListAsync();

        return Ok(subjects);
    }

    // 2. Xem chi tiết môn học
    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetById(int id)
    {
        var subject = await _context.Subjects
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == id);

        if (subject == null)
        {
            return NotFound(new
            {
                message = "Khong tim thay mon hoc"
            });
        }

        return Ok(subject);
    }

    // 3. Thêm môn học mới
    [Authorize(Roles = "Admin")]
    [HttpPost]
    public async Task<IActionResult> Create(
        [FromBody] SubjectRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Code) ||
            string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest(new
            {
                message = "Ma va ten mon hoc khong duoc de trong"
            });
        }

        string code = request.Code.Trim().ToUpperInvariant();

        bool exists = await _context.Subjects
            .AnyAsync(x => x.Code == code);

        if (exists)
        {
            return Conflict(new
            {
                message = "Ma mon hoc da ton tai"
            });
        }

        var subject = new Subject
        {
            Code = code,
            Name = request.Name.Trim(),
            Description = request.Description?.Trim(),
            IsActive = request.IsActive,
            CreatedAtUtc = DateTime.UtcNow
        };

        _context.Subjects.Add(subject);

        await _context.SaveChangesAsync();

        return CreatedAtAction(
            nameof(GetById),
            new { id = subject.Id },
            subject);
    }

    // 4. Cập nhật môn học
    [Authorize(Roles = "Admin")]
    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(
        int id,
        [FromBody] SubjectRequest request)
    {
        var subject = await _context.Subjects
            .FindAsync(id);

        if (subject == null)
        {
            return NotFound(new
            {
                message = "Khong tim thay mon hoc"
            });
        }

        if (string.IsNullOrWhiteSpace(request.Code) ||
            string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest(new
            {
                message = "Ma va ten mon hoc khong duoc de trong"
            });
        }

        string code = request.Code.Trim().ToUpperInvariant();

        bool exists = await _context.Subjects
            .AnyAsync(x =>
                x.Code == code && x.Id != id);

        if (exists)
        {
            return Conflict(new
            {
                message = "Ma mon hoc da ton tai"
            });
        }

        subject.Code = code;
        subject.Name = request.Name.Trim();
        subject.Description = request.Description?.Trim();
        subject.IsActive = request.IsActive;

        await _context.SaveChangesAsync();

        return Ok(subject);
    }

    // 5. Xóa môn học
    [Authorize(Roles = "Admin")]
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var subject = await _context.Subjects
            .FindAsync(id);

        if (subject == null)
        {
            return NotFound(new
            {
                message = "Khong tim thay mon hoc"
            });
        }

        _context.Subjects.Remove(subject);

        await _context.SaveChangesAsync();

        return NoContent();
    }
}
