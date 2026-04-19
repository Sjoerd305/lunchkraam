package httpx

import (
	"errors"
	"net/http"

	"lunchkraam/internal/store"
)

// RespondStoreNotFound writes a 404 JSON error when err is [store.ErrNotFound].
func RespondStoreNotFound(w http.ResponseWriter, err error, nlMessage string) bool {
	if errors.Is(err, store.ErrNotFound) {
		JSONError(w, http.StatusNotFound, "not_found", nlMessage)
		return true
	}
	return false
}

// WriteBankCreditStoreError maps bank reconciliation store errors to JSON responses.
// If waiveAction is true, [store.ErrBankCreditNotOpen] uses the copy for “afhandelen zonder verkoop”.
// Returns false when err is not a mapped store error (caller should send 500).
func WriteBankCreditStoreError(w http.ResponseWriter, err error, waiveAction bool) bool {
	switch {
	case errors.Is(err, store.ErrBankCreditNotFound):
		JSONError(w, http.StatusNotFound, "not_found", "Bankregel niet gevonden.")
		return true
	case errors.Is(err, store.ErrBankCreditNotOpen):
		msg := "Deze bankregel is niet meer open (al gekoppeld of afgehandeld)."
		if waiveAction {
			msg = "Alleen open regels kunnen zo worden afgehandeld."
		}
		JSONError(w, http.StatusConflict, "not_open", msg)
		return true
	case errors.Is(err, store.ErrBankCreditAlreadyMatched):
		JSONError(w, http.StatusConflict, "already_matched", "Deze bankregel is al afgestemd.")
		return true
	case errors.Is(err, store.ErrCardRequestNotFound):
		JSONError(w, http.StatusNotFound, "card_not_found", "Kaartaanvraag niet gevonden.")
		return true
	case errors.Is(err, store.ErrCardRequestNotFulfilled):
		JSONError(w, http.StatusBadRequest, "not_fulfilled", "Alleen vervulde kaartverkopen kunnen gekoppeld worden.")
		return true
	case errors.Is(err, store.ErrCardRequestAlreadyMatched):
		JSONError(w, http.StatusConflict, "card_already_matched", "Deze kaartverkoop is al gekoppeld.")
		return true
	case errors.Is(err, store.ErrRevenueMatchMismatch):
		JSONError(w, http.StatusBadRequest, "mismatch", "Bedrag of doel komt niet overeen met de bankregel.")
		return true
	default:
		return false
	}
}

// WriteTostiCreateStoreError maps store errors from CreateTostiOrder.
func WriteTostiCreateStoreError(w http.ResponseWriter, err error, physicalCard bool) bool {
	switch {
	case errors.Is(err, store.ErrNotFound):
		if physicalCard {
			JSONError(w, http.StatusBadRequest, "no_physical_card", "Geen fysieke tostikaart gevonden. Laat de kraam er eerst één registreren.")
		} else {
			JSONError(w, http.StatusBadRequest, "no_card", "Kaart niet gevonden of niet van jou.")
		}
		return true
	case errors.Is(err, store.ErrNoKnipjes):
		JSONError(w, http.StatusBadRequest, "no_knipjes", "Niet genoeg vrije knipjes op deze kaart.")
		return true
	case errors.Is(err, store.ErrCardPhysicalReadonly):
		JSONError(w, http.StatusBadRequest, "physical_card_readonly", "Fysieke kaart is niet digitaal bruikbaar. Kies fysieke kaart als betaalwijze.")
		return true
	case errors.Is(err, store.ErrTostiInvalidQuantity):
		JSONError(w, http.StatusBadRequest, "invalid_quantity", "Aantal moet tussen 1 en 10 zijn.")
		return true
	case errors.Is(err, store.ErrTostiInvalidBread):
		JSONError(w, http.StatusBadRequest, "invalid_bread", "Brood moet wit of bruin zijn.")
		return true
	case errors.Is(err, store.ErrTostiInvalidFilling):
		JSONError(w, http.StatusBadRequest, "invalid_filling", "Vulling moet ham, kaas of ham_kaas zijn.")
		return true
	case errors.Is(err, store.ErrTostiInvalidRemark):
		JSONError(w, http.StatusBadRequest, "invalid_remark", "Opmerking mag maximaal 500 tekens zijn.")
		return true
	case errors.Is(err, store.ErrCardNotForTosti):
		JSONError(w, http.StatusBadRequest, "wrong_card_kind", "Deze kaart is geen tostikaart.")
		return true
	default:
		return false
	}
}

// WriteTostiMemberCancelStoreError maps store errors from CancelTostiOrder (member, operatorCancel=false).
func WriteTostiMemberCancelStoreError(w http.ResponseWriter, err error) bool {
	switch {
	case errors.Is(err, store.ErrNotFound):
		JSONError(w, http.StatusNotFound, "not_found", "Bestelling niet gevonden.")
		return true
	case errors.Is(err, store.ErrTostiOrderNotPending):
		JSONError(w, http.StatusConflict, "not_pending", "Deze bestelling is al afgehandeld.")
		return true
	case errors.Is(err, store.ErrTostiOrderWrongUser):
		JSONError(w, http.StatusForbidden, "forbidden", "Geen toegang tot deze bestelling.")
		return true
	default:
		return false
	}
}

// WriteTostiOperatorDeliverStoreError maps store errors from DeliverTostiOrder.
func WriteTostiOperatorDeliverStoreError(w http.ResponseWriter, err error) bool {
	switch {
	case errors.Is(err, store.ErrNotFound):
		JSONError(w, http.StatusNotFound, "not_found", "Bestelling niet gevonden.")
		return true
	case errors.Is(err, store.ErrTostiOrderNotPending):
		JSONError(w, http.StatusConflict, "not_pending", "Deze bestelling is niet meer open.")
		return true
	case errors.Is(err, store.ErrNoKnipjes):
		JSONError(w, http.StatusBadRequest, "no_knipjes", "Niet genoeg knipjes op de kaart voor dit aantal.")
		return true
	case errors.Is(err, store.ErrTostiInvalidQuantity):
		JSONError(w, http.StatusInternalServerError, "server_error", "Ongeldige bestelregel.")
		return true
	default:
		return false
	}
}

// WriteTostiOperatorCancelStoreError maps store errors from CancelTostiOrder (operator, operatorCancel=true).
func WriteTostiOperatorCancelStoreError(w http.ResponseWriter, err error) bool {
	switch {
	case errors.Is(err, store.ErrNotFound):
		JSONError(w, http.StatusNotFound, "not_found", "Bestelling niet gevonden.")
		return true
	case errors.Is(err, store.ErrTostiOrderNotPending):
		JSONError(w, http.StatusConflict, "not_pending", "Deze bestelling is al afgehandeld.")
		return true
	default:
		return false
	}
}

// WriteAvondetenRegisterStoreError maps store errors from RegisterAvondetenMealsForDate.
func WriteAvondetenRegisterStoreError(w http.ResponseWriter, err error) bool {
	switch {
	case errors.Is(err, store.ErrNotFound):
		JSONError(w, http.StatusBadRequest, "not_found", "Onbekende kaart in de selectie.")
		return true
	case errors.Is(err, store.ErrAvondetenWrongCardKind):
		JSONError(w, http.StatusBadRequest, "wrong_card", "Alleen avondetenkaarten kunnen zo worden geregistreerd.")
		return true
	case errors.Is(err, store.ErrNoKnipjes):
		JSONError(w, http.StatusBadRequest, "no_knipjes", "Een van de kaarten heeft geen knipjes meer.")
		return true
	case errors.Is(err, store.ErrAvondetenAlreadyRegistered):
		JSONError(w, http.StatusConflict, "already_registered", "Een van de kaarten was al geregistreerd voor deze datum. Vernieuw de lijst en probeer opnieuw.")
		return true
	default:
		return false
	}
}

// WriteCardUseStoreError maps store errors from UseKnipje.
func WriteCardUseStoreError(w http.ResponseWriter, err error) bool {
	switch {
	case errors.Is(err, store.ErrNoKnipjes):
		JSONError(w, http.StatusBadRequest, "no_knipjes", "Deze kaart heeft geen knipjes meer.")
		return true
	case errors.Is(err, store.ErrNotFound):
		JSONError(w, http.StatusNotFound, "not_found", "Kaart niet gevonden.")
		return true
	case errors.Is(err, store.ErrCardPhysicalReadonly):
		JSONError(w, http.StatusBadRequest, "physical_card_readonly", "Fysieke kaarten zijn read-only in de app.")
		return true
	default:
		return false
	}
}

// WriteBuyRequestCreateError maps store errors from CreateCardRequest.
func WriteBuyRequestCreateError(w http.ResponseWriter, err error) bool {
	switch {
	case errors.Is(err, store.ErrAlreadyPending):
		JSONError(w, http.StatusConflict, "already_pending", "Er is al een open aanvraag voor dit kaarttype.")
		return true
	case errors.Is(err, store.ErrForbidden):
		JSONError(w, http.StatusForbidden, "not_matroos_jeugd", "Avondetenkaart alleen voor matroos-jeugd.")
		return true
	default:
		return false
	}
}

// WritePhysicalCardSaleStoreError maps store errors from CreatePhysicalCardSale.
func WritePhysicalCardSaleStoreError(w http.ResponseWriter, err error) bool {
	switch {
	case errors.Is(err, store.ErrNotFound):
		JSONError(w, http.StatusNotFound, "not_found", "Gebruiker niet gevonden.")
		return true
	case errors.Is(err, store.ErrForbidden):
		JSONError(w, http.StatusForbidden, "forbidden", "Avondetenkaart alleen voor matroos-jeugd.")
		return true
	case errors.Is(err, store.ErrAlreadyPending):
		JSONError(w, http.StatusConflict, "already_pending", "Er is al een open aanvraag voor dit kaarttype.")
		return true
	default:
		return false
	}
}

// WriteCancelCardRequestForUserError maps store errors from CancelCardRequestForUser.
func WriteCancelCardRequestForUserError(w http.ResponseWriter, err error) bool {
	switch {
	case errors.Is(err, store.ErrNotFound):
		JSONError(w, http.StatusNotFound, "not_found", "Aanvraag niet gevonden of al verwerkt.")
		return true
	case errors.Is(err, store.ErrCannotCancelTrustUsed):
		JSONError(w, http.StatusConflict, "knipjes_used", "Annuleren niet mogelijk na knipjegebruik.")
		return true
	default:
		return false
	}
}

// WriteCancelAllPendingCardRequestsError maps store errors from CancelAllPendingCardRequestsForUser.
func WriteCancelAllPendingCardRequestsError(w http.ResponseWriter, err error) bool {
	if errors.Is(err, store.ErrCannotCancelTrustUsed) {
		JSONError(w, http.StatusConflict, "knipjes_used", "Annuleren niet mogelijk na knipjegebruik.")
		return true
	}
	return false
}

// WriteAdminFulfillCardRequestError maps store errors from FulfillCardRequest.
func WriteAdminFulfillCardRequestError(w http.ResponseWriter, err error) bool {
	switch {
	case errors.Is(err, store.ErrNotFound):
		JSONError(w, http.StatusNotFound, "not_found", "Aanvraag niet gevonden.")
		return true
	case errors.Is(err, store.ErrForbidden):
		JSONError(w, http.StatusConflict, "already_fulfilled", "Deze aanvraag was al verwerkt.")
		return true
	default:
		return false
	}
}

// WriteAdminRejectCardRequestError maps store errors from AdminRejectCardRequest.
func WriteAdminRejectCardRequestError(w http.ResponseWriter, err error) bool {
	switch {
	case errors.Is(err, store.ErrNotFound):
		JSONError(w, http.StatusNotFound, "not_found", "Aanvraag niet gevonden.")
		return true
	case errors.Is(err, store.ErrCannotRejectKnipjesUsed):
		JSONError(w, http.StatusConflict, "cannot_reject", "Weigeren niet mogelijk na knipjegebruik.")
		return true
	default:
		return false
	}
}

// WriteLocalChangePasswordStoreError maps store errors from ChangeOwnLocalPassword.
func WriteLocalChangePasswordStoreError(w http.ResponseWriter, err error) bool {
	switch {
	case errors.Is(err, store.ErrInvalidCurrentPassword):
		JSONError(w, http.StatusBadRequest, "invalid_current_password", "Huidig wachtwoord is onjuist.")
		return true
	case errors.Is(err, store.ErrNotLocalAccount):
		JSONError(w, http.StatusBadRequest, "not_local_account", "Dit account gebruikt geen lokaal wachtwoord.")
		return true
	case errors.Is(err, store.ErrNotFound):
		JSONError(w, http.StatusNotFound, "not_found", "Gebruiker niet gevonden.")
		return true
	default:
		return false
	}
}
