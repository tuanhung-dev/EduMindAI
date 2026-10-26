
using System.ComponentModel.DataAnnotations;

namespace EduMind.Api.DTOs;

public class SubjectRequest
{
    [Required(ErrorMessage = "Ma mon hoc la bat buoc")]
    [StringLength(20, MinimumLength = 2)]
    public string Code { get; set; } = string.Empty;

    [Required(ErrorMessage = "Ten mon hoc la bat buoc")]
    [StringLength(150)]
    public string Name { get; set; } = string.Empty;

    [StringLength(500)]
    public string? Description { get; set; }

    public bool IsActive { get; set; } = true;
}
