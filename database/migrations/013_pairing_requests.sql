-- Pairing requests table for email-based invitations
-- This allows users to send pairing invitations via email

CREATE TABLE pairing_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id UUID NOT NULL,
    recipient_email VARCHAR(100) NOT NULL,
    token VARCHAR(64) NOT NULL UNIQUE,
    message TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    responded_at TIMESTAMP WITH TIME ZONE,
    responded_by UUID,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (responded_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for faster lookups
CREATE INDEX idx_pairing_requests_token ON pairing_requests(token);
CREATE INDEX idx_pairing_requests_recipient ON pairing_requests(recipient_email);
CREATE INDEX idx_pairing_requests_sender ON pairing_requests(sender_id);
CREATE INDEX idx_pairing_requests_status ON pairing_requests(status);

-- Clean up expired requests (optional - can be run periodically)
-- DELETE FROM pairing_requests WHERE expires_at < NOW() AND status = 'pending';