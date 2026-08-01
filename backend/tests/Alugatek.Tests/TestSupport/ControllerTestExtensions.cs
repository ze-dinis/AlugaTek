using System.Security.Claims;
using Alugatek.Domain.Entities;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Routing;

namespace Alugatek.Tests.TestSupport;

public static class ControllerTestExtensions
{
    /// <summary>Attaches an authenticated principal for <paramref name="user"/> to the controller.</summary>
    public static TController AuthenticateAs<TController>(this TController controller, User user)
        where TController : ControllerBase
    {
        var identity = new ClaimsIdentity(
            [
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Email, user.Email),
                new Claim(ClaimTypes.Name, user.Name),
                new Claim(ClaimTypes.Role, user.Role)
            ],
            authenticationType: "TestAuth");

        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(identity) },
            ActionDescriptor = new ControllerActionDescriptor(),
            RouteData = new RouteData()
        };

        return controller;
    }

    /// <summary>Attaches an anonymous principal (no claims) to the controller.</summary>
    public static TController Anonymous<TController>(this TController controller)
        where TController : ControllerBase
    {
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity()) },
            ActionDescriptor = new ControllerActionDescriptor(),
            RouteData = new RouteData()
        };

        return controller;
    }

    /// <summary>Reads the <c>message</c> property off an anonymous error payload.</summary>
    public static string? GetMessage(this ObjectResult result)
    {
        var value = result.Value;
        return value?.GetType().GetProperty("message")?.GetValue(value) as string;
    }
}
