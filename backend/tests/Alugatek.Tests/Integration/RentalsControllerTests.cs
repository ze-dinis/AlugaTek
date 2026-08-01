using Alugatek.API.Controllers;
using Alugatek.API.DTOs;
using Alugatek.Domain.Entities;
using Alugatek.Infrastructure.Data;
using Alugatek.Tests.TestSupport;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

namespace Alugatek.Tests.Integration;

public class RentalsControllerTests : IDisposable
{
    private const string ValidIban = "PT50000201231234567890154";

    private readonly AppDbContext _db = TestDb.CreateContext();
    private readonly FakePaymentService _payments = new();
    private readonly FakePushNotificationService _push = new();

    public void Dispose() => _db.Dispose();

    private RentalsController CreateController(User user) =>
        new RentalsController(_db, _payments, _push, NullLogger<RentalsController>.Instance)
            .AuthenticateAs(user);

    private static RentalDto DtoOf(ActionResult<RentalDto> result) =>
        Assert.IsType<RentalDto>(Assert.IsType<OkObjectResult>(result.Result).Value);

    [Fact]
    public async Task Create_StoresAPendingRentalPricedByDailyRate()
    {
        var owner = _db.AddUser();
        var renter = _db.AddUser();
        var item = _db.AddItem(owner, dailyRate: 20m, caucao: 100m);

        var start = DateTime.UtcNow.Date.AddDays(1);
        var result = await CreateController(renter).Create(new CreateRentalRequest(item.Id, start, start.AddDays(3)));

        var dto = Assert.IsType<RentalDto>(Assert.IsType<CreatedAtActionResult>(result.Result).Value);
        Assert.Equal(60m, dto.TotalPrice);
        Assert.Equal(100m, dto.CaucaoAmount);
        Assert.Equal(nameof(RentalStatus.Pending), dto.Status);

        var rental = await _db.Rentals.SingleAsync();
        Assert.Equal(renter.Id, rental.RenterId);
    }

    [Fact]
    public async Task Create_NotifiesTheOwnerWithARentalRequestMessageAndPush()
    {
        var owner = _db.AddUser();
        var renter = _db.AddUser();
        var item = _db.AddItem(owner);
        _db.DevicePushTokens.Add(new DevicePushToken { UserId = owner.Id, Token = "token-1", Platform = "android" });
        await _db.SaveChangesAsync();

        var start = DateTime.UtcNow.Date.AddDays(1);
        await CreateController(renter).Create(new CreateRentalRequest(item.Id, start, start.AddDays(1)));

        var message = await _db.Messages.SingleAsync();
        Assert.Equal("RentalRequest", message.MessageType);
        Assert.Equal(owner.Id, message.ReceiverId);
        Assert.Single(_push.ChatMessages);
    }

    [Fact]
    public async Task Create_PrunesDeviceTokensRejectedByThePushProvider()
    {
        var owner = _db.AddUser();
        var renter = _db.AddUser();
        var item = _db.AddItem(owner);
        _db.DevicePushTokens.Add(new DevicePushToken { UserId = owner.Id, Token = "stale", Platform = "android" });
        await _db.SaveChangesAsync();
        _push.InvalidTokens.Add("stale");

        var start = DateTime.UtcNow.Date.AddDays(1);
        await CreateController(renter).Create(new CreateRentalRequest(item.Id, start, start.AddDays(1)));

        Assert.Empty(await _db.DevicePushTokens.ToListAsync());
    }

    [Fact]
    public async Task Create_ReturnsNotFoundForAnUnknownItem()
    {
        var renter = _db.AddUser();
        var start = DateTime.UtcNow.Date.AddDays(1);

        var result = await CreateController(renter).Create(new CreateRentalRequest(Guid.NewGuid(), start, start.AddDays(1)));

        Assert.IsType<NotFoundObjectResult>(result.Result);
    }

    [Fact]
    public async Task Create_RejectsRentingYourOwnItem()
    {
        var owner = _db.AddUser();
        var item = _db.AddItem(owner);
        var start = DateTime.UtcNow.Date.AddDays(1);

        var result = await CreateController(owner).Create(new CreateRentalRequest(item.Id, start, start.AddDays(1)));

        Assert.Equal("You cannot rent your own item.", Assert.IsType<BadRequestObjectResult>(result.Result).GetMessage());
    }

    [Fact]
    public async Task Create_RejectsAnUnavailableItem()
    {
        var owner = _db.AddUser();
        var renter = _db.AddUser();
        var item = _db.AddItem(owner, isAvailable: false);
        var start = DateTime.UtcNow.Date.AddDays(1);

        var result = await CreateController(renter).Create(new CreateRentalRequest(item.Id, start, start.AddDays(1)));

        Assert.Equal("Item is not available.", Assert.IsType<BadRequestObjectResult>(result.Result).GetMessage());
    }

    [Fact]
    public async Task Create_RejectsASecondReservationFromTheSameRenter()
    {
        var owner = _db.AddUser();
        var renter = _db.AddUser();
        var item = _db.AddItem(owner);
        _db.AddRental(item, renter, RentalStatus.Pending);
        var start = DateTime.UtcNow.Date.AddDays(1);

        var result = await CreateController(renter).Create(new CreateRentalRequest(item.Id, start, start.AddDays(1)));

        Assert.Equal(
            "You already have an active reservation for this item.",
            Assert.IsType<BadRequestObjectResult>(result.Result).GetMessage());
    }

    [Fact]
    public async Task Create_RejectsAnItemThatAlreadyHasAConfirmedReservation()
    {
        var owner = _db.AddUser();
        var firstRenter = _db.AddUser();
        var secondRenter = _db.AddUser();
        var item = _db.AddItem(owner);
        _db.AddRental(item, firstRenter, RentalStatus.Active);
        var start = DateTime.UtcNow.Date.AddDays(1);

        var result = await CreateController(secondRenter).Create(new CreateRentalRequest(item.Id, start, start.AddDays(1)));

        Assert.Equal(
            "This item already has a confirmed reservation.",
            Assert.IsType<BadRequestObjectResult>(result.Result).GetMessage());
    }

    [Fact]
    public async Task Create_RejectsAnInvertedDateRange()
    {
        var owner = _db.AddUser();
        var renter = _db.AddUser();
        var item = _db.AddItem(owner);
        var start = DateTime.UtcNow.Date.AddDays(3);

        var result = await CreateController(renter).Create(new CreateRentalRequest(item.Id, start, start.AddDays(-1)));

        Assert.Equal("Invalid date range.", Assert.IsType<BadRequestObjectResult>(result.Result).GetMessage());
    }

    [Fact]
    public async Task Create_RejectsAStartDateInThePast()
    {
        var owner = _db.AddUser();
        var renter = _db.AddUser();
        var item = _db.AddItem(owner);
        var start = DateTime.UtcNow.Date.AddDays(-1);

        var result = await CreateController(renter).Create(new CreateRentalRequest(item.Id, start, start.AddDays(2)));

        Assert.Equal("Start date cannot be in the past.", Assert.IsType<BadRequestObjectResult>(result.Result).GetMessage());
    }

    [Fact]
    public async Task Create_RejectsRentalsLongerThanSixDays()
    {
        var owner = _db.AddUser();
        var renter = _db.AddUser();
        var item = _db.AddItem(owner);
        var start = DateTime.UtcNow.Date.AddDays(1);

        var result = await CreateController(renter).Create(new CreateRentalRequest(item.Id, start, start.AddDays(7)));

        Assert.Equal("Maximum rental duration is 6 days.", Assert.IsType<BadRequestObjectResult>(result.Result).GetMessage());
    }

    [Fact]
    public async Task GetById_IsRestrictedToTheRenterAndTheOwner()
    {
        var owner = _db.AddUser();
        var renter = _db.AddUser();
        var stranger = _db.AddUser();
        var item = _db.AddItem(owner);
        var rental = _db.AddRental(item, renter);

        Assert.IsType<OkObjectResult>((await CreateController(renter).GetById(rental.Id)).Result);
        Assert.IsType<OkObjectResult>((await CreateController(owner).GetById(rental.Id)).Result);
        Assert.IsType<ForbidResult>((await CreateController(stranger).GetById(rental.Id)).Result);
    }

    [Fact]
    public async Task GetMyRentals_ReturnsOnlyTheCallersRentals()
    {
        var owner = _db.AddUser();
        var renter = _db.AddUser();
        var otherRenter = _db.AddUser();
        var item = _db.AddItem(owner);
        var otherItem = _db.AddItem(owner, title: "Other");
        var mine = _db.AddRental(item, renter);
        _db.AddRental(otherItem, otherRenter);

        var result = await CreateController(renter).GetMyRentals();

        var rentals = Assert.IsAssignableFrom<IEnumerable<RentalDto>>(
            Assert.IsType<OkObjectResult>(result.Result).Value);

        Assert.Equal(mine.Id, Assert.Single(rentals).Id);
    }

    [Fact]
    public async Task GetMyRentals_AutoCancelsRentalsThatMissedThePaymentDeadline()
    {
        var owner = _db.AddUser();
        var renter = _db.AddUser();
        var item = _db.AddItem(owner, isAvailable: false);
        var rental = _db.AddRental(item, renter, RentalStatus.Active);
        rental.PaymentDeadline = DateTime.UtcNow.AddMinutes(-1);
        await _db.SaveChangesAsync();

        await CreateController(renter).GetMyRentals();

        var reloaded = await _db.Rentals.SingleAsync();
        Assert.Equal(RentalStatus.Cancelled, reloaded.Status);
        Assert.True((await _db.TechItems.SingleAsync()).IsAvailable);
        Assert.Equal("RentalPaymentExpired", (await _db.Messages.SingleAsync()).MessageType);
    }

    [Fact]
    public async Task Confirm_ByTheOwner_ActivatesTheRentalAndStartsThePaymentWindow()
    {
        var owner = _db.AddUser();
        var renter = _db.AddUser();
        var item = _db.AddItem(owner);
        var rental = _db.AddRental(item, renter);

        var dto = DtoOf(await CreateController(owner).Confirm(rental.Id, new ConfirmRentalRequest(ValidIban)));

        Assert.Equal(nameof(RentalStatus.Active), dto.Status);
        Assert.NotNull(dto.PaymentDeadline);

        var stored = await _db.Rentals.SingleAsync();
        Assert.Equal("IBAN PT50 0002 0123 1234 5678 9015 4", stored.SellerPaymentDestination);
        Assert.False((await _db.TechItems.SingleAsync()).IsAvailable);
    }

    [Fact]
    public async Task Confirm_RejectsAnInvalidPayoutDestination()
    {
        var owner = _db.AddUser();
        var renter = _db.AddUser();
        var rental = _db.AddRental(_db.AddItem(owner), renter);

        var result = await CreateController(owner).Confirm(rental.Id, new ConfirmRentalRequest("not-an-iban"));

        Assert.Equal(
            "Invalid IBAN/MB WAY. Please provide a valid payout destination.",
            Assert.IsType<BadRequestObjectResult>(result.Result).GetMessage());
    }

    [Fact]
    public async Task Confirm_ByANonOwner_IsForbidden()
    {
        var owner = _db.AddUser();
        var renter = _db.AddUser();
        var rental = _db.AddRental(_db.AddItem(owner), renter);

        Assert.IsType<ForbidResult>((await CreateController(renter).Confirm(rental.Id, null)).Result);
    }

    [Fact]
    public async Task Confirm_RejectsARentalThatIsNotPending()
    {
        var owner = _db.AddUser();
        var renter = _db.AddUser();
        var rental = _db.AddRental(_db.AddItem(owner), renter, RentalStatus.Active);

        var result = await CreateController(owner).Confirm(rental.Id, null);

        Assert.Equal(
            "Only pending rentals can be confirmed.",
            Assert.IsType<BadRequestObjectResult>(result.Result).GetMessage());
    }

    [Fact]
    public async Task Confirm_RejectsWhenAnotherReservationIsAlreadyConfirmed()
    {
        var owner = _db.AddUser();
        var firstRenter = _db.AddUser();
        var secondRenter = _db.AddUser();
        var item = _db.AddItem(owner);
        _db.AddRental(item, firstRenter, RentalStatus.Active);
        var pending = _db.AddRental(item, secondRenter);

        var result = await CreateController(owner).Confirm(pending.Id, null);

        Assert.Equal(
            "Another reservation for this item is already confirmed.",
            Assert.IsType<BadRequestObjectResult>(result.Result).GetMessage());
    }

    [Fact]
    public async Task Pay_ChargesRentalPlusCommissionAndHoldsTheCaucao()
    {
        var (rental, renter) = await ActiveRentalReadyForPaymentAsync(totalPrice: 100m, caucao: 200m);

        var dto = DtoOf(await CreateController(renter).Pay(rental.Id, new PayRentalRequest("pm_card_visa", null)));

        Assert.Equal(nameof(RentalStatus.Completed), dto.Status);
        Assert.Equal(nameof(PaymentStatus.Captured), dto.PaymentStatus);
        Assert.Equal(nameof(PaymentStatus.Held), dto.CaucaoPaymentStatus);

        // 3.00 base commission + 10% of the rental price.
        Assert.Equal(113m, Assert.Single(_payments.Charges));
        Assert.Equal(200m, Assert.Single(_payments.Holds));
    }

    [Fact]
    public async Task Pay_EmbedsThePayoutDestinationAndPartyEmailsInTheStripeDescription()
    {
        var (rental, renter) = await ActiveRentalReadyForPaymentAsync();

        await CreateController(renter).Pay(rental.Id, new PayRentalRequest("pm_card_visa", null));

        var description = _payments.Descriptions.First()!;
        Assert.Contains($"rental={rental.Id}", description);
        Assert.Contains("seller_payout=IBAN PT50 0002 0123 1234 5678 9015 4", description);
        Assert.Contains("buyer_email=", description);
    }

    [Fact]
    public async Task Pay_ByANonRenter_IsForbidden()
    {
        var (rental, _) = await ActiveRentalReadyForPaymentAsync();
        var stranger = _db.AddUser();

        var result = await CreateController(stranger).Pay(rental.Id, new PayRentalRequest("pm_card_visa", null));

        Assert.IsType<ForbidResult>(result.Result);
    }

    [Fact]
    public async Task Pay_RequiresAPaymentMethod()
    {
        var (rental, renter) = await ActiveRentalReadyForPaymentAsync();

        var result = await CreateController(renter).Pay(rental.Id, new PayRentalRequest(string.Empty, null));

        Assert.Equal("A payment method is required.", Assert.IsType<BadRequestObjectResult>(result.Result).GetMessage());
    }

    [Fact]
    public async Task Pay_RequiresASellerPayoutDestination()
    {
        var (rental, renter) = await ActiveRentalReadyForPaymentAsync(payoutDestination: null);

        var result = await CreateController(renter).Pay(rental.Id, new PayRentalRequest("pm_card_visa", null));

        Assert.Equal(
            "Seller payout destination is missing. Ask the seller to add a valid IBAN/MB WAY before payment.",
            Assert.IsType<BadRequestObjectResult>(result.Result).GetMessage());
        Assert.Empty(_payments.Charges);
    }

    [Fact]
    public async Task Pay_CancelsTheRentalWhenThePaymentDeadlineHasPassed()
    {
        var (rental, renter) = await ActiveRentalReadyForPaymentAsync(paymentDeadline: DateTime.UtcNow.AddMinutes(-1));

        var result = await CreateController(renter).Pay(rental.Id, new PayRentalRequest("pm_card_visa", null));

        Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Equal(RentalStatus.Cancelled, (await _db.Rentals.SingleAsync()).Status);
        Assert.Empty(_payments.Charges);
    }

    [Fact]
    public async Task Pay_ReturnsBadRequestAndDoesNotCompleteWhenTheCardIsDeclined()
    {
        var (rental, renter) = await ActiveRentalReadyForPaymentAsync();
        _payments.FailCharge = true;

        var result = await CreateController(renter).Pay(rental.Id, new PayRentalRequest("pm_card_visa", null));

        Assert.Equal("Your card was declined.", Assert.IsType<BadRequestObjectResult>(result.Result).GetMessage());
        var stored = await _db.Rentals.SingleAsync();
        Assert.Equal(RentalStatus.Active, stored.Status);
        Assert.Equal(PaymentStatus.None, stored.PaymentStatus);
    }

    [Fact]
    public async Task Pay_StillCompletesWhenOnlyTheCaucaoHoldFails()
    {
        var (rental, renter) = await ActiveRentalReadyForPaymentAsync();
        _payments.FailHold = true;

        var dto = DtoOf(await CreateController(renter).Pay(rental.Id, new PayRentalRequest("pm_card_visa", null)));

        Assert.Equal(nameof(RentalStatus.Completed), dto.Status);
        Assert.Equal(nameof(PaymentStatus.Failed), dto.CaucaoPaymentStatus);
    }

    [Fact]
    public async Task Pay_SkipsTheHoldWhenTheItemHasNoCaucao()
    {
        var (rental, renter) = await ActiveRentalReadyForPaymentAsync(caucao: 0m);

        var dto = DtoOf(await CreateController(renter).Pay(rental.Id, new PayRentalRequest("pm_card_visa", null)));

        Assert.Equal(nameof(PaymentStatus.None), dto.CaucaoPaymentStatus);
        Assert.Empty(_payments.Holds);
    }

    [Fact]
    public async Task Pay_ShiftsTheRentalWindowForwardWhenPaidAfterTheRequestedStart()
    {
        var (rental, renter) = await ActiveRentalReadyForPaymentAsync();
        rental.StartDate = DateTime.UtcNow.Date.AddDays(-3);
        rental.EndDate = DateTime.UtcNow.Date.AddDays(-1);
        await _db.SaveChangesAsync();

        var dto = DtoOf(await CreateController(renter).Pay(rental.Id, new PayRentalRequest("pm_card_visa", null)));

        Assert.Equal(DateTime.UtcNow.Date, dto.StartDate);
        Assert.Equal(DateTime.UtcNow.Date.AddDays(2), dto.EndDate);
    }

    [Fact]
    public async Task GetRenewQuote_AddsATenPercentPlatformCommission()
    {
        var (rental, renter) = await InProgressRentalAsync(dailyRate: 20m);

        var result = await CreateController(renter).GetRenewQuote(rental.Id, 2);

        var quote = Assert.IsType<RenewQuoteDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Equal(40m, quote.AdditionalAmount);
        Assert.Equal(4m, quote.PlatformCommission);
        Assert.Equal(44m, quote.TotalCharge);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(7)]
    public async Task GetRenewQuote_RejectsAnOutOfRangeDuration(int extraDays)
    {
        var (rental, renter) = await InProgressRentalAsync();

        var result = await CreateController(renter).GetRenewQuote(rental.Id, extraDays);

        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public async Task Renew_ExtendsTheRentalAndReplacesTheCaucaoHold()
    {
        var (rental, renter) = await InProgressRentalAsync(dailyRate: 20m, caucao: 150m);
        var originalEnd = rental.EndDate;
        var previousHoldId = rental.CaucaoPaymentIntentId!;

        var dto = DtoOf(await CreateController(renter).Renew(rental.Id, new RenewRentalRequest(2, "pm_card_visa", null)));

        Assert.Equal(originalEnd.AddDays(2), dto.EndDate);
        Assert.Equal(44m, Assert.Single(_payments.Charges));
        Assert.Equal(150m, Assert.Single(_payments.Holds));
        Assert.Equal(previousHoldId, Assert.Single(_payments.ReleasedHolds));
        Assert.NotEqual(previousHoldId, (await _db.Rentals.SingleAsync()).CaucaoPaymentIntentId);
    }

    [Fact]
    public async Task Renew_RollsBackTheChargeAndNewHoldWhenReleasingTheOldHoldFails()
    {
        var (rental, renter) = await InProgressRentalAsync(caucao: 150m);
        var originalEnd = rental.EndDate;
        _payments.FailRelease = true;

        var result = await CreateController(renter).Renew(rental.Id, new RenewRentalRequest(1, "pm_card_visa", null));

        Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Single(_payments.Refunds);
        var stored = await _db.Rentals.SingleAsync();
        Assert.Equal(originalEnd, stored.EndDate);
    }

    [Fact]
    public async Task Renew_RejectsARentalThatIsNotInProgress()
    {
        var owner = _db.AddUser();
        var renter = _db.AddUser();
        var rental = _db.AddRental(_db.AddItem(owner), renter, RentalStatus.Pending);

        var result = await CreateController(renter).Renew(rental.Id, new RenewRentalRequest(1, "pm_card_visa", null));

        Assert.Equal(
            "Only rentals in progress can be renewed.",
            Assert.IsType<BadRequestObjectResult>(result.Result).GetMessage());
    }

    [Fact]
    public async Task Renew_RejectsAnAlreadyExpiredRental()
    {
        var (rental, renter) = await InProgressRentalAsync();
        rental.EndDate = DateTime.UtcNow.AddDays(-1);
        await _db.SaveChangesAsync();

        var result = await CreateController(renter).Renew(rental.Id, new RenewRentalRequest(1, "pm_card_visa", null));

        Assert.Equal(
            "This rental has already expired and cannot be renewed.",
            Assert.IsType<BadRequestObjectResult>(result.Result).GetMessage());
    }

    [Fact]
    public async Task Return_MovesTheRentalToReturnRequestedAndNotifiesTheOwner()
    {
        var (rental, renter) = await InProgressRentalAsync();

        var dto = DtoOf(await CreateController(renter).Return(rental.Id));

        Assert.Equal(nameof(RentalStatus.ReturnRequested), dto.Status);
        Assert.Contains(await _db.Messages.ToListAsync(), m => m.MessageType == "ReturnRequest");
    }

    [Fact]
    public async Task Return_RejectsARentalThatIsNotInProgress()
    {
        var owner = _db.AddUser();
        var renter = _db.AddUser();
        var rental = _db.AddRental(_db.AddItem(owner), renter, RentalStatus.Pending);

        var result = await CreateController(renter).Return(rental.Id);

        Assert.Equal(
            "Only rentals in progress can be returned.",
            Assert.IsType<BadRequestObjectResult>(result.Result).GetMessage());
    }

    [Fact]
    public async Task ConfirmReturn_ReleasesTheCaucaoHoldAndRelistsTheItem()
    {
        var (rental, _) = await InProgressRentalAsync(caucao: 150m);
        rental.Status = RentalStatus.ReturnRequested;
        await _db.SaveChangesAsync();
        var owner = await _db.Users.SingleAsync(u => u.Id == rental.Item.OwnerId);

        var dto = DtoOf(await CreateController(owner).ConfirmReturn(rental.Id));

        Assert.Equal(nameof(RentalStatus.Returned), dto.Status);
        Assert.Equal(nameof(PaymentStatus.Released), dto.CaucaoPaymentStatus);
        Assert.Single(_payments.ReleasedHolds);
        Assert.True((await _db.TechItems.SingleAsync()).IsAvailable);
    }

    [Fact]
    public async Task ConfirmReturn_KeepsTheRentalOpenWhenStripeRefusesToReleaseTheHold()
    {
        var (rental, _) = await InProgressRentalAsync(caucao: 150m);
        rental.Status = RentalStatus.ReturnRequested;
        await _db.SaveChangesAsync();
        var owner = await _db.Users.SingleAsync(u => u.Id == rental.Item.OwnerId);
        _payments.FailRelease = true;

        var result = await CreateController(owner).ConfirmReturn(rental.Id);

        Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Equal(RentalStatus.ReturnRequested, (await _db.Rentals.SingleAsync()).Status);
    }

    [Fact]
    public async Task DeclineReturn_PutsTheRentalBackInProgress()
    {
        var owner = _db.AddUser();
        var renter = _db.AddUser();
        var rental = _db.AddRental(_db.AddItem(owner), renter, RentalStatus.ReturnRequested);

        var dto = DtoOf(await CreateController(owner).DeclineReturn(rental.Id));

        Assert.Equal(nameof(RentalStatus.Completed), dto.Status);
        Assert.Contains(await _db.Messages.ToListAsync(), m => m.MessageType == "ReturnDeclined");
    }

    [Fact]
    public async Task Decline_CancelsAPendingRequest()
    {
        var owner = _db.AddUser();
        var renter = _db.AddUser();
        var rental = _db.AddRental(_db.AddItem(owner), renter);

        var dto = DtoOf(await CreateController(owner).Decline(rental.Id));

        Assert.Equal(nameof(RentalStatus.Cancelled), dto.Status);
        Assert.Contains(await _db.Messages.ToListAsync(), m => m.MessageType == "RentalDeclined");
    }

    [Fact]
    public async Task Decline_ByTheRenter_IsForbidden()
    {
        var owner = _db.AddUser();
        var renter = _db.AddUser();
        var rental = _db.AddRental(_db.AddItem(owner), renter);

        Assert.IsType<ForbidResult>((await CreateController(renter).Decline(rental.Id)).Result);
    }

    [Fact]
    public async Task Cancel_RefundsThePriceAndReleasesTheHold()
    {
        var (rental, renter) = await InProgressRentalAsync(caucao: 150m);
        rental.Status = RentalStatus.Active;
        await _db.SaveChangesAsync();

        var dto = DtoOf(await CreateController(renter).Cancel(rental.Id));

        Assert.Equal(nameof(RentalStatus.Cancelled), dto.Status);
        Assert.Equal(nameof(PaymentStatus.Released), dto.PaymentStatus);
        Assert.Equal(nameof(PaymentStatus.Released), dto.CaucaoPaymentStatus);
        Assert.Single(_payments.Refunds);
        Assert.Single(_payments.ReleasedHolds);
        Assert.True((await _db.TechItems.SingleAsync()).IsAvailable);
    }

    [Fact]
    public async Task Cancel_ByTheOwner_IsForbidden()
    {
        var owner = _db.AddUser();
        var renter = _db.AddUser();
        var rental = _db.AddRental(_db.AddItem(owner), renter);

        Assert.IsType<ForbidResult>((await CreateController(owner).Cancel(rental.Id)).Result);
    }

    [Fact]
    public async Task Cancel_RejectsARentalThatIsAlreadyFinished()
    {
        var owner = _db.AddUser();
        var renter = _db.AddUser();
        var rental = _db.AddRental(_db.AddItem(owner), renter, RentalStatus.Returned);

        var result = await CreateController(renter).Cancel(rental.Id);

        Assert.Equal("Rental cannot be cancelled.", Assert.IsType<BadRequestObjectResult>(result.Result).GetMessage());
    }

    [Fact]
    public async Task OpenDispute_RecordsADisputeMessageForTheCounterparty()
    {
        var owner = _db.AddUser();
        var renter = _db.AddUser();
        var rental = _db.AddRental(_db.AddItem(owner), renter, RentalStatus.Completed);

        var result = await CreateController(renter).OpenDispute(rental.Id, new OpenDisputeRequest("Damage", "Lens is scratched"));

        Assert.IsType<OkObjectResult>(result);
        var message = await _db.Messages.SingleAsync();
        Assert.Equal("DisputeOpened", message.MessageType);
        Assert.Equal(owner.Id, message.ReceiverId);
        Assert.Contains("Lens is scratched", message.Content);
    }

    [Fact]
    public async Task OpenDispute_RequiresAReasonAndDescription()
    {
        var owner = _db.AddUser();
        var renter = _db.AddUser();
        var rental = _db.AddRental(_db.AddItem(owner), renter, RentalStatus.Completed);

        var result = await CreateController(renter).OpenDispute(rental.Id, new OpenDisputeRequest(" ", "Details"));

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task OpenDispute_ByAnUninvolvedUser_IsForbidden()
    {
        var owner = _db.AddUser();
        var renter = _db.AddUser();
        var stranger = _db.AddUser();
        var rental = _db.AddRental(_db.AddItem(owner), renter, RentalStatus.Completed);

        var result = await CreateController(stranger).OpenDispute(rental.Id, new OpenDisputeRequest("Damage", "Details"));

        Assert.IsType<ForbidResult>(result);
    }

    /// <summary>Creates an owner-confirmed rental that is waiting for the renter to pay.</summary>
    private async Task<(Rental Rental, User Renter)> ActiveRentalReadyForPaymentAsync(
        decimal totalPrice = 40m,
        decimal caucao = 100m,
        string? payoutDestination = ValidIban,
        DateTime? paymentDeadline = null)
    {
        var owner = _db.AddUser(name: "Owner");
        var renter = _db.AddUser(name: "Renter");
        var item = _db.AddItem(owner, caucao: caucao);
        var rental = _db.AddRental(item, renter, RentalStatus.Active, totalPrice);

        rental.CaucaoAmount = caucao;
        rental.SellerPaymentDestination = payoutDestination;
        rental.PaymentDeadline = paymentDeadline ?? DateTime.UtcNow.AddMinutes(10);
        await _db.SaveChangesAsync();

        return (rental, renter);
    }

    /// <summary>Creates a paid rental (status Completed) with an active caução hold.</summary>
    private async Task<(Rental Rental, User Renter)> InProgressRentalAsync(
        decimal dailyRate = 20m,
        decimal caucao = 100m)
    {
        var owner = _db.AddUser(name: "Owner");
        var renter = _db.AddUser(name: "Renter");
        var item = _db.AddItem(owner, dailyRate: dailyRate, caucao: caucao, isAvailable: false);
        var rental = _db.AddRental(item, renter, RentalStatus.Completed, dailyRate * 2);

        rental.CaucaoAmount = caucao;
        rental.SellerPaymentDestination = ValidIban;
        rental.PaymentStatus = PaymentStatus.Captured;
        rental.PaymentIntentId = "pi_existing_charge";
        rental.EndDate = DateTime.UtcNow.Date.AddDays(2);

        if (caucao > 0)
        {
            rental.CaucaoPaymentStatus = PaymentStatus.Held;
            rental.CaucaoPaymentIntentId = "pi_existing_hold";
        }

        await _db.SaveChangesAsync();
        await _db.Entry(rental).Reference(r => r.Item).LoadAsync();

        return (rental, renter);
    }
}
