using System.Net;
using Alugatek.API.Storage;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.FileProviders;

namespace Alugatek.Tests.TestSupport;

/// <summary>Minimal <see cref="IWebHostEnvironment"/> so controllers can inspect the environment name.</summary>
public sealed class FakeWebHostEnvironment(string environmentName = "Development") : IWebHostEnvironment
{
    public string EnvironmentName { get; set; } = environmentName;
    public string ApplicationName { get; set; } = "Alugatek.Tests";
    public string WebRootPath { get; set; } = Path.GetTempPath();
    public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
    public string ContentRootPath { get; set; } = Path.GetTempPath();
    public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
}

/// <summary>Stores uploads in memory and returns predictable URLs.</summary>
public sealed class FakeItemImageStorage : IItemImageStorage
{
    public List<string> SavedFileNames { get; } = [];

    public Task<string> SaveAsync(IFormFile photo, CancellationToken cancellationToken = default)
    {
        SavedFileNames.Add(photo.FileName);
        return Task.FromResult($"/uploads/{SavedFileNames.Count}-{photo.FileName}");
    }
}

/// <summary>Returns an <see cref="HttpClient"/> backed by a stub handler so no real network calls happen.</summary>
public sealed class FakeHttpClientFactory(HttpMessageHandler handler) : IHttpClientFactory
{
    public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
}

/// <summary>A single outbound request captured by <see cref="StubHttpMessageHandler"/>.</summary>
public sealed record CapturedRequest(HttpMethod Method, Uri Uri, string? AuthorizationParameter, string Body);

/// <summary>
/// Captures outgoing requests (eagerly buffering their bodies, because <see cref="HttpClient"/>
/// disposes request content once the call completes) and replies with a configurable status code.
/// </summary>
public sealed class StubHttpMessageHandler(HttpStatusCode statusCode = HttpStatusCode.OK) : HttpMessageHandler
{
    public List<CapturedRequest> Requests { get; } = [];
    public HttpStatusCode StatusCode { get; set; } = statusCode;

    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        var body = request.Content is null
            ? string.Empty
            : await request.Content.ReadAsStringAsync(cancellationToken);

        Requests.Add(new CapturedRequest(
            request.Method,
            request.RequestUri!,
            request.Headers.Authorization?.Parameter,
            body));

        return new HttpResponseMessage(StatusCode)
        {
            Content = new StringContent("{}")
        };
    }
}
